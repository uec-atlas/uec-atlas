import type { APIRoute } from "astro";
import { educationMap } from "@/data";
import { toFullURL } from "@/utils/url";

export const prerender = true;

export const allJSONLD = {
  "@context": [
    toFullURL("/schema/education.context.jsonld"),
    {
      items: {
        "@id": "hydra:member",
        "@container": "@set",
      },
    },
  ],
  "@id": toFullURL("/resources/education/all"),
  "@type": ["void:Dataset", "hydra:Collection"],
  "void:title": "UEC Atlas - All Education Data",
  "void:license": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  "void:sparqlEndpoint": toFullURL("/sparql"),
  "hydra:totalItems": educationMap.size,
  items: Array.from(educationMap.values()),
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(allJSONLD), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/ld+json",
      Link: [
        `<${toFullURL("/schema/education.context.jsonld")}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`,
        `<${toFullURL(`/ontology/education.ttl`)}>; rel="describedby"; type="text/turtle"`,
      ].join(", "),
    },
  });
};
