import type { APIRoute } from "astro";
import { organizationMap } from "@/data";
import { toFullURL } from "@/utils/url";

export const prerender = true;

const allOrganizations = Array.from(organizationMap.values());

export const GET: APIRoute = async () => {
  const response = {
    "@context": toFullURL("/schema/organization.context.jsonld"),
    "@id": toFullURL("/resources/organizations"),
    "@type": ["void:Dataset", "hydra:Collection"],
    "void:title": "UEC Atlas - Organizations",
    "void:license": "https://creativecommons.org/licenses/by-nc-sa/4.0/",
    "void:sparqlEndpoint": toFullURL("/sparql"),
    "void:dataDump": {
      "@id": toFullURL("/resources/organizations/all"),
    },
    "hydra:totalItems": allOrganizations.length,
    "hydra:member": allOrganizations.map((organization) => ({
      "@id": organization.id,
      "@type": organization.type,
    })),
  };

  return new Response(JSON.stringify(response), {
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
