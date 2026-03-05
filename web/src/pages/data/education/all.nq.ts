import type { APIRoute } from "astro";
import type { JsonLdDocument } from "jsonld";
import { getOntology } from "@/pages/ontology/[path].ttl";
import { resolveContext } from "@/pages/schema/[id].context.jsonld";
import { jsonLdToNQuads } from "@/utils/n-quads";
import { expandURI } from "@/utils/url";
import { allJSONLD } from "./all";

export const prerender = true;

const ontology = await getOntology("education");
if (!ontology) throw new Error("Ontology not found");

const inferenceRules = [
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
        { ?p uao:checkpoint / uao:courseRequirement ?r }
      }
      UNION
      {
        ?c uao:prerequisite ?p .
        { ?p uao:category ?cat }
        UNION
        { ?p uao:checkpoint / uao:categoryRequirement / uao:targetCategory ?cat }
        ?cat uao:hasSubCategory* ?sub .
        ?mapping a uao:CourseCategoryMapping ; uao:category ?sub ; uao:course ?r .
      }
      FILTER NOT EXISTS { ?c uao:_dependsCourse ?r }
    }
  `,
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
];

const jsonLd = await resolveContext(allJSONLD);
const allEducationNQuads = await jsonLdToNQuads(
  ontology,
  jsonLd as JsonLdDocument,
  inferenceRules,
);

export const GET: APIRoute = async () => {
  return new Response(allEducationNQuads, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/n-quads; charset=utf-8",
    },
  });
};
