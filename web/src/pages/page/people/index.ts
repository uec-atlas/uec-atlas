import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ redirect }) =>
  redirect(`/page/people/all`, 303);
