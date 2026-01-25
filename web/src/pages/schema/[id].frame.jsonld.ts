import { toFullURL } from "@/utils/url";
import type { APIRoute } from "astro";
import { getContext, resolveContext } from "./[id].context.jsonld";

export const prerender = true;

const files = import.meta.glob("../../../../generated/*.frame.jsonld", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const getStaticPaths = async () => {
  return Object.keys(files).map((item) => ({
    params: { id: item.split("/").pop()?.replace(".frame.jsonld", "") },
  }));
};

export const getFrame = async(id?: string, expandContext?: boolean) => {
  const file = Object.entries(files).find(([key, _value]) =>
    key.endsWith(`${id}.frame.jsonld`),
  );
  if (!file) {
    return null;
  }
  const frame = JSON.parse(file[1]);
  if (typeof frame["@context"] === "string") {
    frame["@context"] = toFullURL(`/schema/${frame["@context"]}`);
  } else if (Array.isArray(frame["@context"])) {
    frame["@context"] = frame["@context"].map((contextItem) => {
      if (typeof contextItem === "string") {
        return toFullURL(`/schema/${contextItem}`);
      }
      return contextItem;
    });
  }
  if(expandContext) return await resolveContext(frame);

  return frame;
}

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  const frame = await getFrame(id);
  if (!frame) {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(JSON.stringify(frame), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/ld+json",
    },
  });
};
