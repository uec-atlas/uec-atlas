import { type CollectionEntry, getCollection, getEntry } from "astro:content";
import type { APIRoute } from "astro";
import { geoJSONToWkt } from "betterknown";
import { toFullURL } from "@/utils/url";

export const prerender = true;

export const getStaticPaths = async () => {
  const entries = await getCollection("rooms");
  return entries.map((entry) => ({
    params: { id: entry.id.replace("uatr:rooms/", "") },
  }));
};

export const toFullRoomData = ({ data }: CollectionEntry<"rooms">) => ({
  "geo:hasGeometry": {
    "@type": "geo:Geometry",
    "geo:asWKT": geoJSONToWkt(data.geometry),
  },
  ...data,
});

export const GET: APIRoute = async ({ params }) => {
  const { id } = params;
  const entry = await getEntry("rooms", `uatr:rooms/${id}`);
  if (!entry) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(
    JSON.stringify({
      "@context": toFullURL("/schema/room.context.jsonld"),
      "void:inDataset": toFullURL("/resources/rooms/"),
      ...toFullRoomData(entry),
    }),
    {
      headers: {
        "Content-Type": "application/ld+json",
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
};
