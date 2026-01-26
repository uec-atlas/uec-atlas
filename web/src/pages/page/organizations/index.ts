import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ redirect }) =>
  redirect(`/page/organizations/all`, 303);
