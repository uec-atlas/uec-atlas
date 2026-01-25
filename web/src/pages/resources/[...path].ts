import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ params, request, redirect }) => {
  const { path } = params;
  const accept = request.headers.get("Accept") || "";
  let response: Response = redirect(`/data/${path}`, 303);
  if (accept.includes("text/html")) {
    response = redirect(`/page/${path}`, 303);
  }
  response.headers.set("Vary", "Accept");
  response.headers.set("Access-Control-Allow-Origin", "*");
  return response;
};
