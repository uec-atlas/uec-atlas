import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request, locals, redirect }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("query");
  const accept = request.headers.get("Accept") || "";

  if (!query && accept.includes("text/html")) {
    return redirect("/sparql-playground");
  }

  const endpoint = locals.runtime.env.SPARQL_ENDPOINT;
  if (!endpoint) {
    return new Response("SPARQL_ENDPOINT is not defined", { status: 500 });
  }

  const targetUrl = new URL(endpoint);
  if (query) {
    targetUrl.searchParams.set("query", query);
  }

  const response = await fetch(targetUrl.toString(), {
    method: "GET",
    headers: {
      Accept: accept,
    },
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("Content-Type") ||
        "application/sparql-results+json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=3600",
    },
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const endpoint = locals.runtime.env.SPARQL_ENDPOINT;
  if (!endpoint) {
    return new Response("SPARQL_ENDPOINT is not defined", { status: 500 });
  }

  const contentType = request.headers.get("Content-Type") || "";
  const accept = request.headers.get("Accept") || "";

  let body: any;
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

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      Accept: accept,
    },
    body: body,
  });

  return new Response(response.body, {
    status: response.status,
    headers: {
      "Content-Type":
        response.headers.get("Content-Type") ||
        "application/sparql-results+json",
      "Access-Control-Allow-Origin": "*",
    },
  });
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
