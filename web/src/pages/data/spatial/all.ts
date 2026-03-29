import type { APIRoute } from "astro";
import { spatialMap } from "@/data";
import { spatialEntitySorter } from "@/data/spatial";
import { toFullURL } from "@/utils/url";

export const prerender = true;

const allSpatialEntities = Array.from(spatialMap.values()).sort(
  spatialEntitySorter,
);

export const allJSONLD = {
  "@context": [
    toFullURL("/schema/spatial.context.jsonld"),
    {
      features: {
        "@id": "hydra:member",
        "@container": "@set",
      },
    },
  ],
  "@id": toFullURL("/resources/spatial/all"),
  "@type": ["void:Dataset", "hydra:Collection"],
  type: "FeatureCollection",
  "void:title": "UEC Atlas - All Spatial Data",
  "void:license": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  "void:sparqlEndpoint": toFullURL("/sparql"),
  "hydra:totalItems": allSpatialEntities.length,
  features: allSpatialEntities,
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(allJSONLD), {
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
