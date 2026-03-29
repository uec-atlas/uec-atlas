import type { APIRoute } from "astro";
import { spatialMap } from "@/data";
import { toFullURL } from "@/utils/url";

export const prerender = true;

const allSpatialEntities = Array.from(spatialMap.values());

export const GET: APIRoute = async () => {
  const response = {
    "@context": toFullURL("/schema/spatial.context.jsonld"),
    "@id": toFullURL("/resources/spatial"),
    "@type": ["void:Dataset", "hydra:Collection"],
    "void:title": "UEC Atlas - Spatial Data",
    "void:license": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    "void:sparqlEndpoint": toFullURL("/sparql"),
    "void:dataDump": {
      "@id": toFullURL("/resources/spatial/all"),
    },
    "hydra:totalItems": allSpatialEntities.length,
    "hydra:member": allSpatialEntities.map((spatial) => ({
      "@id": spatial.id,
      "@type": spatial.type,
    })),
  };

  return new Response(JSON.stringify(response), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/ld+json",
      Link: [
        `<${toFullURL("/schema/spatial.context.jsonld")}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`,
        `<${toFullURL(`/ontology/spatial.ttl`)}>; rel="describedby"; type="text/turtle"`,
      ].join(", "),
    },
  });
};
