import type { APIRoute } from "astro";
import { peopleMap } from "@/data";
import { toFullURL } from "@/utils/url";

export const prerender = true;

const allPeople = Array.from(peopleMap.values());

export const allJSONLD = {
  "@context": [
    toFullURL("/schema/people.context.jsonld"),
    {
      items: {
        "@id": "hydra:member",
        "@container": "@set",
      },
    },
  ],
  "@id": toFullURL("/resources/people/all"),
  "@type": ["void:Dataset", "hydra:Collection"],
  "void:title": "UEC Atlas - All People",
  "void:license": "https://creativecommons.org/by/4.0/",
  "void:sparqlEndpoint": toFullURL("/sparql"),
  "hydra:totalItems": allPeople.length,
  items: allPeople,
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(allJSONLD), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/ld+json",
      Link: [
        `<${toFullURL("/schema/people.context.jsonld")}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`,
        `<${toFullURL(`/ontology/people.ttl`)}>; rel="describedby"; type="text/turtle"`,
      ].join(", "),
    },
  });
};
