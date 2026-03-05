import type { APIRoute } from "astro";
import {
  courseCategoryMap,
  courseMap,
  curriculumMap,
  lectureMap,
} from "@/data";
import { toFullURL } from "@/utils/url";

export const prerender = true;

const allEducation = [
  ...courseMap.values(),
  ...courseCategoryMap.values(),
  ...curriculumMap.values(),
  ...lectureMap.values(),
];

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
  "void:license": "https://creativecommons.org/by/4.0/",
  "void:sparqlEndpoint": toFullURL("/sparql"),
  "hydra:totalItems": allEducation.length,
  items: allEducation,
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
