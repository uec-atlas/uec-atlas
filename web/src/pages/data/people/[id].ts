import type { APIRoute } from "astro";
import type { JsonLdObj } from "jsonld/jsonld-spec";
import { peopleMap } from "@/data";
import { toFullURL } from "@/utils/url";

export const prerender = true;

export const peopleJsonLdMap = new Map<string, JsonLdObj>();

for (const [id, person] of peopleMap) {
  peopleJsonLdMap.set(id, {
    "@context": toFullURL("/schema/people.context.jsonld"),
    "void:inDataset": toFullURL("/resources/people"),
    ...person,
  });
}

export const getStaticPaths = async () => {
  return Array.from(peopleJsonLdMap.entries()).map(([id, entry]) => ({
    params: {
      id: id.replace("uar:people/", ""),
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
        `<${toFullURL("/schema/people.context.jsonld")}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`,
        `<${toFullURL(`/ontology/people.ttl`)}>; rel="describedby"; type="text/turtle"`,
      ].join(", "),
    },
  });
};
