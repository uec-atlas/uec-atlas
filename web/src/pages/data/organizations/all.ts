import type { APIRoute } from "astro";
import { organizationMap } from "@/data";
import { organizationSorter } from "@/data/organizations";
import { toFullURL } from "@/utils/url";

export const prerender = true;

const allOrganizations = Array.from(organizationMap.values()).sort(
  organizationSorter,
);

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
  "hydra:totalItems": allOrganizations.length,
  items: allOrganizations,
};

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
