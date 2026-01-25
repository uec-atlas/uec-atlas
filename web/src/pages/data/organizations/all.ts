import { type CollectionEntry, getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { toFullURL } from "@/utils/url";
import type { NodeObject } from "jsonld";

export const prerender = true;

const files = await getCollection("organizations");

const toFullOrganizationData = ({
  data,
}: CollectionEntry<"organizations">) => ({
  ...data,
  hasSubOrganization: files
    .filter((org) => org.data.subOrganizationOf === data.id)
    .map((org) => org.id),
});

export const allData = files.map(toFullOrganizationData).toSorted((a, b) => {
  if (!a.name?.ja) return -1;
  if (!b.name?.ja) return 1;
  return a.name.ja > b.name.ja ? 1 : -1;
});

export const allJSONLD = {
  "@context": [
    toFullURL("/schema/organization.context.jsonld"),
    {
      items: {
        "@id": "hydra:member",
        "@container": "@set",
      },
    },
  ],
  "@id": toFullURL("/resources/organizations/all"),
  "@type": ["void:Dataset", "hydra:Collection"],
  "void:title": "UEC Atlas - All Organizations",
  "void:license": "https://creativecommons.org/by/4.0/",
  "void:sparqlEndpoint": toFullURL("/sparql"),
  "hydra:totalItems": allData.length,
  items: allData,
} satisfies NodeObject;

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(allJSONLD), {
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
