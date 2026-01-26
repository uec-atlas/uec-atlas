import { type CollectionEntry, getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { toFullURL } from "@/utils/url";

export const prerender = true;

const files = await getCollection("organizations");

const toFullOrganizationData = ({
  data,
}: CollectionEntry<"organizations">) => ({
  ...data,
  hasSubOrganization: files
    .filter((org) => org.data.subOrganizationOf?.includes(data.id))
    .map((org) => org.id)
    .toSorted(),
  relatedTo: [
    ...(data.relatedTo ?? []),
    ...files.filter((org) => org.data.relatedTo?.some((rel) => rel.target === data.id)).flatMap((org) =>
      org.data.relatedTo?.filter((rel) => rel.target === data.id).map((rel) => ({
        type: rel.type,
        target: org.id,
      })) ?? [],
    ),
  ]
});

export const allData = files.map(toFullOrganizationData);

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
}

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
