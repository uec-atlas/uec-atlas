import type { APIRoute } from "astro";
import type { JsonLdObj } from "jsonld/jsonld-spec";
import {
  courseCategoryMap,
  courseMap,
  curriculumMap,
  lectureMap,
} from "@/data";
import { toFullURL } from "@/utils/url";

export const prerender = true;

const educationJsonLdMap = new Map<string, JsonLdObj>();

const contextUrl = toFullURL("/schema/education.context.jsonld");
const datasetUrl = toFullURL("/resources/education");

for (const [id, entity] of courseMap) {
  // @ts-expect-error 型が合ってない
  educationJsonLdMap.set(id, {
    "@context": contextUrl,
    "void:inDataset": datasetUrl,
    ...entity,
  });
}

for (const [id, entity] of courseCategoryMap) {
  educationJsonLdMap.set(id, {
    "@context": contextUrl,
    "void:inDataset": datasetUrl,
    ...entity,
  });
}

for (const [id, entity] of curriculumMap) {
  educationJsonLdMap.set(id, {
    "@context": contextUrl,
    "void:inDataset": datasetUrl,
    ...entity,
  });
}

for (const [id, entity] of lectureMap) {
  educationJsonLdMap.set(id, {
    "@context": contextUrl,
    "void:inDataset": datasetUrl,
    ...entity,
  });
}

export const getStaticPaths = async () => {
  return Array.from(educationJsonLdMap.entries()).map(([id, entry]) => ({
    params: {
      id: id.replace("uar:education/", ""),
    },
    props: {
      entry,
    },
  }));
};

export const GET: APIRoute = async ({ props }) => {
  return new Response(JSON.stringify(props.entry), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/ld+json",
      Link: [
        `<${contextUrl}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`,
        `<${toFullURL(`/ontology/education.ttl`)}>; rel="describedby"; type="text/turtle"`,
      ].join(", "),
    },
  });
};
