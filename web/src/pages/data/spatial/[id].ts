import type { APIRoute } from "astro";
import type { JsonLdObj } from "jsonld/jsonld-spec";
import { spatialMap } from "@/data";
import { toFullURL } from "@/utils/url";

export const prerender = true;

export const spatialJsonLdMap = new Map<string, JsonLdObj>();

for (const [id, spatialEntity] of spatialMap) {
  spatialJsonLdMap.set(id, {
    "@context": toFullURL("/schema/spatial.context.jsonld"),
    "void:inDataset": toFullURL("/resources/spatial"),
    ...spatialEntity,
  } as unknown as JsonLdObj);
}

export const getStaticPaths = async () => {
  return Array.from(spatialJsonLdMap.entries()).map(([id, entry]) => ({
    params: {
      id: id.replace("uar:spatial/", ""),
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
        `<${toFullURL("/schema/spatial.context.jsonld")}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`,
        `<${toFullURL(`/ontology/spatial.ttl`)}>; rel="describedby"; type="text/turtle"`,
      ].join(", "),
    },
  });
};
