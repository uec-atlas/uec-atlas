import type { APIRoute } from "astro";
import ontologyMap from "../../../../generated/ontology_map.json";

export const GET: APIRoute = async ({ params, redirect, request }) => {
  const path = params.path as keyof typeof ontologyMap;
  const targetOntology = ontologyMap[path];
  if (!targetOntology) {
    return new Response("Not Found", { status: 404 });
  }

  const accept = request.headers.get("Accept") || "";
  if (accept.includes("text/html")) {
    const response = redirect(`/docs/ontology/${path}`, 303);
    response.headers.set("Vary", "Accept");
    response.headers.set("Access-Control-Allow-Origin", "*");
    return response;
  }

  const response: Response = redirect(`/ontology/${targetOntology}`, 303);
  response.headers.set("Vary", "Accept");
  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
};
