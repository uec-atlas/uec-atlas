import type { APIRoute } from "astro";

async function handleSparqlRequest(
  context: Parameters<APIRoute>[0],
  method: "GET" | "POST",
) {
  const { request, locals } = context;
  const url = new URL(request.url);
  const accept = request.headers.get("accept") || "";
  const acceptEncoding = request.headers.get("accept-encoding") || "";
  const endpoint = locals.runtime.env.SPARQL_ENDPOINT;

  if (!endpoint) {
    return new Response("SPARQL_ENDPOINT is not defined", { status: 500 });
  }

  let body: any;
  const contentType = request.headers.get("content-type") || "";

  if (method === "GET") {
    const query = url.searchParams.get("query");
    body = query ? query : undefined;
  } else if (method === "POST") {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await request.formData();
      const params = new URLSearchParams();
      for (const [key, value] of formData.entries()) {
        params.append(key, value.toString());
      }
      body = params;
    } else if (contentType.includes("application/sparql-query")) {
      body = await request.text();
    } else {
      return new Response("Unsupported Content-Type", { status: 400 });
    }
  }

  const cacheKey = new Request(request.url, {
    method: "GET",
    headers: {
      accept: accept,
      "x-original-method": method,
    },
  });

  const cache = (caches as any).default;
  const cachedResponse = await cache.match(cacheKey);

  let ifNoneMatch = request.headers.get("if-none-match");
  if (!ifNoneMatch && cachedResponse) {
    const cachedEtag = cachedResponse.headers.get("etag");
    if (cachedEtag) {
      ifNoneMatch = cachedEtag;
    }
  }

  const fetchHeaders: Record<string, string> = {
    Accept: accept,
  };
  if (contentType) fetchHeaders["content-type"] = contentType;
  if (ifNoneMatch) fetchHeaders["if-none-match"] = ifNoneMatch;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: fetchHeaders,
    body: body,
  });

  if (response.status === 304 && cachedResponse) {
    const headers = new Headers(
      Object.fromEntries(cachedResponse.headers.entries()),
    );
    headers.set("cache-control", "public, max-age=3600, s-maxage=3600");
    headers.set("access-control-allow-origin", "*");

    return new Response(cachedResponse.body, {
      status: 200,
      headers: headers,
    });
  }

  const cleanHeaders = new Headers(
    Object.fromEntries(response.headers.entries()),
  );
  cleanHeaders.delete("cache-control");
  cleanHeaders.set("access-control-allow-origin", "*");

  const [streamForClient, streamForCache] = response.body
    ? response.body.tee()
    : [null, null];

  const clientHeaders = new Headers(cleanHeaders);
  clientHeaders.set("cache-control", "public, max-age=3600, s-maxage=3600");
  clientHeaders.set(
    "etag",
    response.headers.get("etag")?.replace(/^W\//, "") || "",
  );

  const newResponse = new Response(streamForClient, {
    status: response.status,
    headers: clientHeaders,
  });

  if (
    response.status === 200 &&
    response.headers.get("etag") &&
    streamForCache
  ) {
    const cacheHeaders = new Headers(cleanHeaders);
    cacheHeaders.set("cache-control", "public, max-age=3600, s-maxage=3600");

    const putResponse = new Response(streamForCache, {
      status: response.status,
      headers: cacheHeaders,
    });

    const ctx = locals.runtime.ctx;
    if (ctx?.waitUntil) {
      ctx.waitUntil(cache.put(cacheKey, putResponse));
    } else {
      await cache.put(cacheKey, putResponse);
    }
  }

  return newResponse;
}

export const GET: APIRoute = async (context) => {
  const url = new URL(context.request.url);
  const query = url.searchParams.get("query");
  const accept = context.request.headers.get("Accept") || "";

  if (!query && accept.includes("text/html")) {
    return context.redirect("/sparql-playground");
  }

  return handleSparqlRequest(context, "GET");
};

export const POST: APIRoute = async (context) => {
  return handleSparqlRequest(context, "POST");
};

export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS",
      "access-control-allow-headers": "Content-Type, Accept, If-None-Match",
    },
  });
};
