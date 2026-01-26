import type { APIRoute } from "astro";
import { allJSONLD } from "./all";
import { n3reasoner } from 'eyereasoner';
import { resolveContext } from "@/pages/schema/[id].context.jsonld";
import jsonld, { type JsonLdDocument } from "jsonld";
import { getOntology } from "@/pages/ontology/[path].ttl";
import * as oxigraph from "oxigraph";

export const prerender = true;

const jsonLd = await resolveContext(allJSONLD);
const nQuads = await jsonld.toRDF(jsonLd as JsonLdDocument, { format: "application/n-quads" }) as string;

const owlRules: Record<string, string> = import.meta.glob("/node_modules/eye-reasoning/rpo/owl-*.n3", {
  eager: true,
  query: "raw",
  import: "default"
})
const rdfRules: Record<string, string> = import.meta.glob("/node_modules/eye-reasoning/rpo/rdfs-*.n3", {
  eager: true,
  query: "raw",
  import: "default"
})

const ontology = (await getOntology("organization"))!;
const result = await n3reasoner([nQuads, ontology,
  ...Object.values(rdfRules),
  ...Object.values(owlRules),
  `
  @prefix skos: <http://www.w3.org/2004/02/skos/core#> .
  @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
  @prefix owl: <http://www.w3.org/2002/07/owl#> .

  skos:exactMatch rdfs:subPropertyOf owl:equivalentClass .`
], "{ ?s ?p ?o } => { ?s ?p ?o }.", {
  outputType: "quads"
}).catch(e => {
  console.error("EYE Reasoning error:", e);
  throw e;
});

const store = new oxigraph.Store();
for (const q of result) {
  const toOxiTerm = (term: any) => {
    if (term.termType === 'NamedNode') {
      return oxigraph.namedNode(term.value);
    }
    if (term.termType === 'BlankNode') {
      return oxigraph.blankNode(term.value);
    }
    if (term.termType === 'Literal') {
      return oxigraph.literal(
        term.value,
        term.language || (term.datatype ? oxigraph.namedNode(term.datatype.value) : undefined)
      );
    }
    return oxigraph.namedNode(term.value);
  };

  try {
    store.add(oxigraph.quad(
      toOxiTerm(q.subject) as oxigraph.Quad_Subject,
      toOxiTerm(q.predicate) as oxigraph.Quad_Predicate,
      toOxiTerm(q.object),
      oxigraph.defaultGraph()
    ));
  } catch {}
}

const cleanResult = store.query(`
PREFIX uato: <https://uec-atlas.e-chan1007.workers.dev/ontology/>
PREFIX org: <http://www.w3.org/ns/org#>
PREFIX schema: <http://schema.org/>
PREFIX owl: <http://www.w3.org/2002/07/owl#>

CONSTRUCT {
  ?s ?p ?o .
}
WHERE {
  ?s ?p ?o .
  FILTER(!isBlank(?s))
  FILTER(!isBlank(?o))
  FILTER(!(?p = owl:sameAs && ?s = ?o))
}
`);

const finalTurtle = new oxigraph.Store(cleanResult as any).dump({ format: "nq" });
export const allOrganizationsNQuads = finalTurtle;

export const GET: APIRoute = async () => {
  return new Response(allOrganizationsNQuads, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/n-quads; charset=utf-8"
    },
  });
};
