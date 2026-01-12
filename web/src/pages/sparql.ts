import { text } from "node:stream/consumers";
import { QueryEngine } from "@comunica/query-sparql";
import type { APIRoute } from "astro";
import { toFullURL } from "@/utils/url";

const engine = new QueryEngine();
const executeQuery = async (query: string, fetch: typeof globalThis.fetch) => {
  const result = await engine.query(query, {
    sources: [
      {
        type: "file",
        value: toFullURL("/data/rooms/all"),
      },
    ],
    baseIRI: toFullURL("/"),
    fetch,
  });

  const { data } = await engine.resultToString(
    result,
    "application/sparql-results+json",
  );
  return await text(data);
};

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("query") || "";
  console.log(query);
  const data = await executeQuery(
    query,
    locals.runtime.env.SELF.fetch.bind(locals.runtime.env.SELF),
  );
  return new Response(data, {
    headers: {
      "Content-Type": "application/sparql-results+json",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const formData = await request.formData();
  const query = (formData.get("query") as string) || "";
  console.log(query);
  const data = await executeQuery(
    query,
    locals.runtime.env.SELF.fetch.bind(locals.runtime.env.SELF),
  );
  return new Response(data, {
    headers: {
      "Content-Type": "application/sparql-results+json",
      "Access-Control-Allow-Origin": "*",
    },
  });
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
};
