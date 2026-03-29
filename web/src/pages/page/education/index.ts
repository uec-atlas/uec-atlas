import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ redirect }) =>
  redirect(`/page/education/all`, 303);
