import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ redirect }) => {
  const response = redirect(`/data/rooms/index.jsonld`, 303);
  response.headers.set("Vary", "Accept");
  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
};


