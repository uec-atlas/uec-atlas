import type { APIRoute } from "astro";
import type { JsonLdDocument } from "jsonld";
import { getOntology } from "@/pages/ontology/[path].ttl";
import { resolveContext } from "@/pages/schema/[id].context.jsonld";
import { jsonLdToNQuads } from "@/utils/n-quads";
import { allJSONLD } from "./all";

export const prerender = true;

const ontology = await getOntology("education");
if (!ontology) throw new Error("Ontology not found");

const jsonLd = await resolveContext(allJSONLD);
const allEducationNQuads = await jsonLdToNQuads(
  ontology,
  jsonLd as JsonLdDocument,
);

export const GET: APIRoute = async () => {
  return new Response(allEducationNQuads, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/n-quads; charset=utf-8",
    },
  });
};
