import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ params, redirect }) => {
  const { id } = params;
  const [type, ..._rest] = id?.split(".") || [];
  let contentType: string | null = null;
  let data: string;
  try {
    if (id?.endsWith(".context.jsonld")) {
      contentType = "application/ld+json";
      ({ default: data } = await import(
        `../../../../generated/${type}.context.jsonld?raw`
      ));
    } else if (id?.endsWith(".schema.json")) {
      contentType = "application/schema+json";
      ({ default: data } = await import(
        `../../../../generated/${type}.schema.json?raw`
      ));
    } else {
      const response = redirect(`/schema/${id}.context.jsonld`, 303);
      response.headers.set("Vary", "Accept");
      response.headers.set("Access-Control-Allow-Origin", "*");
      return response;
    }
    return new Response(JSON.stringify(JSON.parse(data)), {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": contentType,
        Vary: "Accept",
      },
    });
  } catch {
    return new Response("Not Found", {
      status: 404,
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }
};
