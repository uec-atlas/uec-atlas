import { n3reasoner } from "eyereasoner";
import type { PostalAddress } from "generated/organization";
import jsonld from "jsonld";
import {
  type BlankNode,
  blankNode,
  defaultGraph,
  initOxigraph,
  type Literal,
  literal,
  type NamedNode,
  namedNode,
  type Quad_Predicate,
  type Quad_Subject,
  quad,
  Store,
} from "@/utils/oxigraph";

export const formatAddress = (address: PostalAddress, locale = "ja") => {
  if (!address) return "";
  const parts = [];
  if (locale === "ja") {
    if (address.postalCode) parts.push(`〒${address.postalCode} `);
    if (address.addressRegion) parts.push(address.addressRegion.ja);
    if (address.addressLocality) parts.push(address.addressLocality.ja);
    if (address.streetAddress) parts.push(address.streetAddress.ja);
    return parts.join("");
  } else {
    if (address.streetAddress) parts.push(address.streetAddress.en);
    if (address.addressLocality) parts.push(address.addressLocality.en);
    if (address.addressRegion) parts.push(address.addressRegion.en);
    if (address.postalCode) parts.push(address.postalCode);
    return parts.join(", ");
  }
};

const owlRules: Record<string, string> = import.meta.glob(
  "/node_modules/eye-reasoning/rpo/{owl-equivalentClass,owl-equivalentProperty,owl-inverseOf,owl-sameAs}.n3",
  {
    eager: true,
    query: "raw",
    import: "default",
  },
);
const rdfRules: Record<string, string> = import.meta.glob(
  "/node_modules/eye-reasoning/rpo/rdfs-*.n3",
  {
    eager: true,
    query: "raw",
    import: "default",
  },
);

export const jsonLdToNQuads = async (ontology: string, jsonLd: object) => {
  const nQuads = (await jsonld.toRDF(jsonLd, {
    format: "application/n-quads",
  })) as string;

  await initOxigraph();
  const result = await n3reasoner(
    [nQuads, ontology, ...Object.values(rdfRules), ...Object.values(owlRules)],
    `
   @prefix log: <http://www.w3.org/2000/10/swap/log#> .
  {
    ?s ?p ?o .
    ?s log:uri ?sUri .
  } => {
    ?s ?p ?o
  }.`,
    {
      outputType: "quads",
    },
  ).catch((e) => {
    console.error("EYE Reasoning error:", e);
    throw e;
  });

  const store = new Store();
  for (const q of result) {
    const toOxiTerm = (term: {
      termType: string;
      value: string;
      language?: string;
      datatype?: { value: string };
    }) => {
      if (term.termType === "NamedNode") {
        return namedNode(term.value);
      }
      if (term.termType === "BlankNode") {
        return blankNode(term.value);
      }
      if (term.termType === "Literal") {
        return literal(
          term.value,
          term.language ||
            (term.datatype ? namedNode(term.datatype.value) : undefined),
        );
      }
      return namedNode(term.value);
    };

    try {
      store.add(
        quad(
          toOxiTerm(q.subject) as Quad_Subject,
          toOxiTerm(q.predicate) as Quad_Predicate,
          toOxiTerm(q.object),
          defaultGraph(),
        ),
      );
    } catch {}
  }

  const uarPrefix = "https://uec-atlas.e-chan1007.workers.dev/resources/";
  const queue: (NamedNode | BlankNode)[] = [];
  const visited = new Set<string>();
  const toKey = (term: NamedNode | BlankNode | Literal) =>
    `${term.termType}:${term.value}`;

  // Find roots
  for (const q of store.match(
    undefined,
    undefined,
    undefined,
    defaultGraph(),
  )) {
    if (
      q.subject.termType === "NamedNode" &&
      q.subject.value.startsWith(uarPrefix)
    ) {
      const key = toKey(q.subject);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(q.subject);
      }
    }
  }

  // Crawl
  const forbiddenPredicates = new Set([
    "http://www.w3.org/2002/07/owl#sameAs",
    "http://www.w3.org/2000/01/rdf-schema#subClassOf",
    "http://www.w3.org/2000/01/rdf-schema#subPropertyOf",
  ]);

  let head = 0;
  while (head < queue.length) {
    const s = queue[head++];
    for (const q of store.match(s, undefined, undefined, defaultGraph())) {
      if (forbiddenPredicates.has(q.predicate.value)) continue;
      // Don't follow rdf:type for reachability
      if (
        q.predicate.value === "http://www.w3.org/1999/02/22-rdf-syntax-ns#type"
      )
        continue;

      if (q.object.termType === "BlankNode") {
        const key = toKey(q.object);
        if (!visited.has(key)) {
          visited.add(key);
          queue.push(q.object);
        }
      }
    }
  }

  const finalStore = new Store();
  for (const sTerm of queue) {
    for (const q of store.match(sTerm, undefined, undefined, defaultGraph())) {
      if (forbiddenPredicates.has(q.predicate.value)) continue;
      if (
        q.predicate.value ===
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" &&
        q.object.termType === "BlankNode"
      )
        continue;

      finalStore.add(q);
    }
  }

  return finalStore.dump({
    format: "nq",
  });
};
