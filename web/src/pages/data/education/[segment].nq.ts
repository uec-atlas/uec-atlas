import type { APIRoute } from "astro";
import type { JsonLdDocument } from "jsonld";
import {
  courseCategoryMap,
  courseMap,
  curriculumMap,
  lectureMap,
} from "@/data";
import { getOntology } from "@/pages/ontology/[path].ttl";
import { resolveContext } from "@/pages/schema/[id].context.jsonld";
import { jsonLdToNQuads } from "@/utils/n-quads";
import { expandURI, toFullURL } from "@/utils/url";

export const prerender = true;

const ontology = await getOntology("education");
if (!ontology) throw new Error("Ontology not found");

const inferenceRules = [
  // 1. 科目間の直接・間接依存関係 (カテゴリ経由を含む)
  ` # Course-Course Dependency
    PREFIX uao: <${expandURI("uao:")}>
    INSERT {
      ?c uao:_dependsCourse ?r .
    }
    WHERE {
      {
        ?c uao:prerequisite ?p .
        { ?p uao:course ?r }
        UNION
        { ?p uao:checkpoint / uao:requiredCourse ?r }
      }
      UNION
      {
        ?c uao:prerequisite ?p .
        { ?p uao:category ?cat }
        UNION
        { ?p uao:checkpoint / uao:requiredCategory / uao:targetCategory ?cat }

        ?cat uao:hasSubCategory* ?sub .
        ?mapping a uao:CourseCategoryMapping ; uao:category ?sub ; uao:course ?r .
      }
      FILTER NOT EXISTS { ?c uao:_dependsCourse ?r }
    }
  `,
  // 2. 【再帰】科目間の依存連鎖を requiresCourse に集約
  ` # Course-Course Mapping
    PREFIX uao: <${expandURI("uao:")}>
    INSERT {
      ?c uao:requiresCourse ?r .
    }
    WHERE {
      ?c uao:_dependsCourse+ ?r .
      FILTER NOT EXISTS { ?c uao:requiresCourse ?r }
    }
  `,
  // 3. 組織ショートカット
  ` # Course-Organization Mapping
    PREFIX uao: <${expandURI("uao:")}>
    INSERT {
      ?course uao:organization ?org .
    }
    WHERE {
      ?mapping a uao:CourseCategoryMapping; uao:course ?course ; uao:targetOrganization ?org .
      FILTER NOT EXISTS { ?course uao:organization ?org }
    }
  `,
  // 4. 逆関係 (必要なものだけ)
  ` # Inverse requirements
    PREFIX uao: <${expandURI("uao:")}>
    INSERT {
      ?r uao:requiredBy ?c .
    }
    WHERE {
      ?c uao:requiresCourse ?r .
      FILTER NOT EXISTS { ?r uao:requiredBy ?c }
    }
  `,
];

type Segment = "courses" | "categories" | "curriculum" | "lectures";

export function getStaticPaths() {
  return [
    { params: { segment: "courses" } },
    { params: { segment: "categories" } },
    { params: { segment: "curriculum" } },
    { params: { segment: "lectures" } },
  ];
}

export const GET: APIRoute = async ({ params }) => {
  const segment = params.segment as Segment;

  let items: object[] = [];
  switch (segment) {
    case "courses":
      items = [...courseMap.values()];
      break;
    case "categories":
      items = [...courseCategoryMap.values()];
      break;
    case "curriculum":
      items = [...curriculumMap.values()];
      break;
    case "lectures":
      items = [...lectureMap.values()];
      break;
  }

  const jsonLd = await resolveContext({
    "@context": [
      toFullURL("/schema/education.context.jsonld"),
      { items: { "@id": "hydra:member", "@container": "@set" } },
    ],
    "@id": toFullURL(`/resources/education/${segment}`),
    "@type": ["void:Dataset", "hydra:Collection"],
    items,
  });

  const nQuads = await jsonLdToNQuads(
    ontology,
    jsonLd as JsonLdDocument,
    inferenceRules,
  );

  return new Response(nQuads, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/n-quads; charset=utf-8",
    },
  });
};
