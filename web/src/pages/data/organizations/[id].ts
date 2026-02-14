import type { APIRoute } from "astro";
import type { JsonLdObj } from "jsonld/jsonld-spec";
import { organizationMap } from "@/data";
import { toFullURL } from "@/utils/url";

export const prerender = true;

export const organizationJsonLdMap = new Map<string, JsonLdObj>();

for (const [id, organizationEntity] of organizationMap) {
  organizationJsonLdMap.set(id, {
    "@context": toFullURL("/schema/organization.context.jsonld"),
    "void:inDataset": toFullURL("/resources/organizations"),
    ...organizationEntity,
  });
}

export const getStaticPaths = async () => {
  return Array.from(organizationJsonLdMap.entries()).map(([id, entry]) => ({
    params: {
      id: id.replace("uar:organizations/", ""),
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
        `<${toFullURL("/schema/organization.context.jsonld")}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`,
        `<${toFullURL(`/ontology/organization.ttl`)}>; rel="describedby"; type="text/turtle"`,
      ].join(", "),
    },
  });
};
