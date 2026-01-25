import { getCollection } from "astro:content";
import type { APIRoute } from "astro"
import { toFullURL } from "@/utils/url";
import { allData } from "./all";

export const prerender = true;

export const getStaticPaths = async () => {
  const entries = await getCollection("organizations");
  return entries.map((entry) => ({
    params: { id: entry.id.replace("uatr:organizations/", "") },
  }));
};

export const getOrganizationData = (id?: string) => {
  const entry = allData.find((org) => org.id === `uatr:organizations/${id}`);
  if (!entry) {
    return null;
  }
  return {
    "@context": toFullURL("/schema/organization.context.jsonld"),
    "void:inDataset": toFullURL("/resources/organizations"),
    ...entry,
  }
}

export const GET: APIRoute = async ({ params }) => {
  const { id } = params;
  const data = getOrganizationData(id);
  if (!data) {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(
    JSON.stringify(data),
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/ld+json",
        Link: [
          `<${toFullURL("/schema/organization.context.jsonld")}>; rel="http://www.w3.org/ns/json-ld#context"; type="application/ld+json"`,
          `<${toFullURL(`/ontology/organization.ttl`)}>; rel="describedby"; type="text/turtle"`,
        ].join(", "),
      },
    },
  );
};
