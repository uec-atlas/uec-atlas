import { text } from "node:stream/consumers";
import { QueryEngine } from "@comunica/query-sparql";
import type { APIRoute } from "astro";
import { toFullURL } from "@/utils/url";

const engine = new QueryEngine();

const DATA_SOURCES = [
  toFullURL("/data/organizations/all.nq"),
];

const parseAccept = (accept: string) => {
  return accept
    .split(",")
    .map((part) => {
      const [type, ...params] = part.split(";");
      const qParam = params.find((p) => p.trim().startsWith("q="));
      const q = qParam ? Number.parseFloat(qParam.trim().substring(2)) : 1.0;
      return { type: type.trim(), q };
    })
    .sort((a, b) => b.q - a.q);
};

const executeQuery = async (
  query: string,
  fetch: typeof globalThis.fetch,
  acceptedTypes: ReturnType<typeof parseAccept>,
) => {
  const result = await engine.query(query, {
    sources: DATA_SOURCES,
    baseIRI: toFullURL("/"),
    fetch
  });

  const availableMediaTypes = Object.entries(
    await engine.getResultMediaTypes(result),
  )
    .sort(([, q], [, p]) => p - q)
    .map(([type]) => type);

  for (const accepted of acceptedTypes) {
    if (accepted.type === "*/*") {
      for (const type of availableMediaTypes) {
        try {
          const { data } = await engine.resultToString(result, type);
          return [await text(data), type] as const;
        } catch {}
      }
    } else if (availableMediaTypes.includes(accepted.type)) {
      try {
        const { data } = await engine.resultToString(result, accepted.type);
        return [await text(data), accepted.type] as const;
      } catch {}
    }
  }

  const actualAvailableMediaTypes: string[] = [];

  for (const type of availableMediaTypes) {
    try {
      await engine.resultToString(result, type);
      actualAvailableMediaTypes.push(type);
    } catch {}
  }

  throw new Error(
    `No acceptable media type found. Available: ${actualAvailableMediaTypes.join(", ")}`,
  );
};

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("query") || "";
  const accept = request.headers.get("Accept") || "";
  const acceptedTypes = parseAccept(accept);

  try {
    const internalFetch = locals.runtime.env.SELF.fetch.bind(locals.runtime.env.SELF);

    const [data, mediaType] = await executeQuery(
      query,
      internalFetch,
      acceptedTypes,
    );
    return new Response(data, {
      headers: {
        "Content-Type": mediaType,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      return new Response(`Internal Server Error: ${error.message}`, {
        status: 500,
      });
    }
    return new Response("Internal Server Error", { status: 500 });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const formData = await request.formData();
  const query = (formData.get("query") as string) || "";
  const accept = request.headers.get("Accept") || "";
  const acceptedTypes = parseAccept(accept);
  try {
    const internalFetch = locals.runtime.env.SELF.fetch.bind(locals.runtime.env.SELF);

    const [data, mediaType] = await executeQuery(
      query,
      internalFetch,
      acceptedTypes,
    );
    return new Response(data, {
      headers: {
        "Content-Type": mediaType,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error(error);
    if (error instanceof Error) {
      return new Response(`Internal Server Error: ${error.message}`, {
        status: 500,
      });
    }
    return new Response("Internal Server Error", { status: 500 });
  }
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
    },
  });
};
