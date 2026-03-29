import type { APIRoute } from "astro";
import { educationMap } from "@/data";
import { toFullURL } from "@/utils/url";

export const prerender = true;

const allEducation = Array.from(educationMap.values());

export const GET: APIRoute = async () => {
  const response = {
    "@context": toFullURL("/schema/education.context.jsonld"),
    "@id": toFullURL("/resources/education"),
    "@type": ["void:Dataset", "hydra:Collection"],
    "void:title": "UEC Atlas - Education",
    "void:license": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    "void:sparqlEndpoint": toFullURL("/sparql"),
    "void:dataDump": {
      "@id": toFullURL("/resources/education/all"),
    },
    "hydra:totalItems": allEducation.length,
    "hydra:member": allEducation.map((entry) => ({
      "@id": entry.id,
      "@type": entry.type,
    })),
  };

  return new Response(JSON.stringify(response), {
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
