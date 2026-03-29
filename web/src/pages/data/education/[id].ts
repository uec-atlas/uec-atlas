import type { APIRoute } from "astro";
import type { JsonLdObj } from "jsonld/jsonld-spec";
import { educationMap } from "@/data";
import { toFullURL } from "@/utils/url";

export const prerender = true;

export const educationJsonLdMap = new Map<string, JsonLdObj>();

const contextUrl = toFullURL("/schema/education.context.jsonld");
const datasetUrl = toFullURL("/resources/education");

for (const [id, entry] of educationMap.entries()) {
  // @ts-expect-error 型が合ってない
  educationJsonLdMap.set(id, {
    "@context": contextUrl,
    "void:inDataset": datasetUrl,
    ...entry,
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
