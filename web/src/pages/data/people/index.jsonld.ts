import type { APIRoute } from "astro";
import { peopleMap } from "@/data";
import { toFullURL } from "@/utils/url";

export const prerender = true;

const allPeople = Array.from(peopleMap.values());

export const GET: APIRoute = async () => {
  const response = {
    "@context": toFullURL("/schema/people.context.jsonld"),
    "@id": toFullURL("/resources/people"),
    "@type": ["void:Dataset", "hydra:Collection"],
    "void:title": "UEC Atlas - People",
    "void:license": "https://creativecommons.org/by/4.0/",
    "void:sparqlEndpoint": toFullURL("/sparql"),
    "void:dataDump": {
      "@id": toFullURL("/resources/people/all"),
    },
    "hydra:totalItems": allPeople.length,
    "hydra:member": allPeople.map((person) => ({
      "@id": person.id,
      "@type": "Person",
    })),
  };

  return new Response(JSON.stringify(response), {
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
