import { getCollection } from "astro:content";
import type { APIRoute } from "astro";
import { toFullURL } from "@/utils/url";
import { toFullRoomData } from "./[id]";

export const prerender = true;

export const GET: APIRoute = async () => {
  const files = await getCollection("rooms");

  const allData = files.map(toFullRoomData);

  const response = {
    "@context": [
      toFullURL("/schema/room.context.jsonld"),
      {
        features: {
          "@id": "hydra:member",
          "@container": "@set",
        },
      },
    ],
    "@id": toFullURL("/resources/rooms/all"),
    "@type": ["void:Dataset", "hydra:Collection"],
    "void:title": "UEC Atlas - All Rooms",
    "void:license": "https://creativecommons.org/publicdomain/zero/1.0/",
    "void:sparqlEndpoint": toFullURL("/sparql"),
    "hydra:totalItems": allData.length,
    type: "FeatureCollection",
    features: allData,
  };
  return new Response(JSON.stringify(response), {
    headers: {
      "Content-Type": "application/ld+json",
      "Access-Control-Allow-Origin": "*",
    },
  });
};
