import jsonld from "jsonld";
import {
  type BlankNode,
  defaultGraph,
  initOxigraph,
  type Literal,
  type NamedNode,
  namedNode,
  Store,
} from "@/utils/oxigraph";
import { expandURI } from "./url";

export const jsonLdToNQuads = async (
  ontology: string,
  jsonLd: object,
  inferenceRules: string[] = [],
) => {
  const nQuads = (await jsonld.toRDF(jsonLd, {
    format: "application/n-quads",
  })) as string;

  await initOxigraph();
  const store = new Store();
  const ontologyGraph = namedNode("urn:uec-atlas:ontology");

  store.load(nQuads, { format: "application/n-quads" });
  store.load(ontology, { format: "text/turtle", to_graph_name: ontologyGraph });

  const inferenceUpdates = [
    ` # rdfs:subPropertyOf
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      INSERT {
        ?s ?superP ?o .
      }
      WHERE {
        GRAPH <${ontologyGraph.value}> {
          ?p rdfs:subPropertyOf+ ?superP .
          FILTER(?p != ?superP)
          FILTER(?superP != rdfs:subPropertyOf)
          FILTER(?superP != rdfs:subClassOf)
        }
        ?s ?p ?o .
      }
    `,
    ` # rdfs:subClassOf
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      INSERT {
        ?x rdf:type ?superClass .
      }
      WHERE {
        GRAPH <${ontologyGraph.value}> {
          ?class rdfs:subClassOf+ ?superClass .
          FILTER(?class != ?superClass)
          FILTER(?superClass != rdfs:Class)
        }
        ?x rdf:type ?class .
      }
    `,
    ` # owl:inverseOf
      PREFIX owl: <http://www.w3.org/2002/07/owl#>
      INSERT {
        ?o ?q ?s .
      }
      WHERE {
        GRAPH <${ontologyGraph.value}> {
          ?p owl:inverseOf ?q .
        }
        ?s ?p ?o .
        FILTER(?s != ?o)
      }
    `,
    ` # owl:inverseOf (inverse direction)
      PREFIX owl: <http://www.w3.org/2002/07/owl#>
      INSERT {
        ?o ?p ?s .
      }
      WHERE {
        GRAPH <${ontologyGraph.value}> {
          ?p owl:inverseOf ?q .
        }
        ?s ?q ?o .
        FILTER(?s != ?o)
      }
    `,
    ...inferenceRules,
  ];

  const maxInferenceIterations = 10;
  let iteration = 0;
  let lastSize = 0;
  while (store.size !== lastSize) {
    lastSize = store.size;
    iteration += 1;
    if (iteration > maxInferenceIterations) {
      throw new Error("Inference did not converge within iteration limit");
    }

    for (const update of inferenceUpdates) {
      store.update(update);
    }
  }

  const uarPrefix = "https://uec-atlas.org/resources/";
  const tempPrefix = expandURI("uao:_");

  const uarPrefixStr = uarPrefix.toString();
  const queue: (NamedNode | BlankNode)[] = [];
  const visited = new Set<string>();
  const toKey = (term: NamedNode | BlankNode | Literal) =>
    `${term.termType}:${term.value}`;

  for (const q of store.match(
    undefined,
    undefined,
    undefined,
    defaultGraph(),
  )) {
    if (
      q.subject.termType === "NamedNode" &&
      q.subject.value.startsWith(uarPrefixStr)
    ) {
      const key = toKey(q.subject);
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(q.subject);
      }
    }
  }

  let head = 0;
  while (head < queue.length) {
    const s = queue[head++];
    for (const q of store.match(s, undefined, undefined, defaultGraph())) {
      if (q.predicate.value.startsWith(tempPrefix)) continue;
      if (
        q.predicate.value ===
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" &&
        q.object.termType === "BlankNode"
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
  for (const s of queue) {
    for (const q of store.match(s, undefined, undefined, defaultGraph())) {
      if (
        q.predicate.value ===
          "http://www.w3.org/1999/02/22-rdf-syntax-ns#type" &&
        q.object.termType === "BlankNode"
      )
        continue;

      // 軽量化のためのフィルタリング
      // 1. コメントや定義、ラベルの一部（rdfs:comment, rdfs:isDefinedBy）を除去
      if (
        q.predicate.value === "http://www.w3.org/2000/01/rdf-schema#comment" ||
        q.predicate.value === "http://www.w3.org/2000/01/rdf-schema#isDefinedBy"
      ) {
        continue;
      }

      // 2. 外部語彙のメタデータを間引く（必要に応じて）
      // 例: hydra:totalItems などの統計情報が推論で増えている場合は除去

      finalStore.add(q);
    }
  }

  // N-Quadsの出力を最小化（空白行やコメントを極力減らす）
  return finalStore
    .dump({
      format: "nq",
    })
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .join("\n");
};
