import type { APIRoute } from "astro";
import { initOxigraph, Store } from "@/utils/oxigraph";
import { toFullURL } from "@/utils/url";

let cachedStore: Store | null = null;

const SUPPORTED_SELECT_FORMATS = [
  "application/sparql-results+json",
  "application/sparql-results+xml",
  "application/sparql-results+csv",
  "text/csv",
  "text/tab-separated-values",
];

const SUPPORTED_CONSTRUCT_FORMATS = [
  "text/turtle",
  "application/json",
  "application/ld+json",
  "application/rdf+json",
  "application/rdf+xml",
  "application/n-triples",
  "application/n-quads",
  "application/trig",
  "text/csv",
  "text/tab-separated-values",
];

async function getStore(runtimeFetch: typeof fetch) {
  await initOxigraph();
  if (cachedStore) return cachedStore;

  const nQuadURLs = [
    toFullURL("/data/organizations/all.nq"),
    toFullURL("/data/spatial/all.nq"),
  ];
  const nquadsList = await Promise.all(
    nQuadURLs.map(async (url) => {
      const res = await runtimeFetch(url);
      return res.text();
    }),
  );

  const store = new Store();
  for (const nquads of nquadsList) {
    store.load(nquads, { format: "application/n-quads" });
  }

  cachedStore = store;
  return store;
}

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

const getQueryType = (query: string) => {
  const match = query.match(
    /(?:^|\s|;)(SELECT|ASK|CONSTRUCT|DESCRIBE)(?:\s|$)/i,
  );
  return match ? match[1].toUpperCase() : null;
};

const createFetch =
  (env: Env) => async (input: URL | RequestInfo, init?: RequestInit) => {
    if (import.meta.env.DEV) return fetch(input, init);
    return env.SELF.fetch(input, init);
  };

const executeQuery = async (
  query: string,
  runtimeFetch: typeof fetch,
  acceptedTypes: ReturnType<typeof parseAccept>,
) => {
  const store = await getStore(runtimeFetch);
  const queryType = getQueryType(query);

  if (!queryType) {
    throw new Error("Could not determine query type");
  }

  const isSelectOrAsk = queryType === "SELECT" || queryType === "ASK";
  const supported = isSelectOrAsk
    ? SUPPORTED_SELECT_FORMATS
    : SUPPORTED_CONSTRUCT_FORMATS;

  let selectedFormat = "";
  for (const accepted of acceptedTypes) {
    if (accepted.type === "*/*") {
      selectedFormat = supported[0];
      break;
    }
    if (supported.includes(accepted.type)) {
      selectedFormat = accepted.type;
      break;
    }
  }

  selectedFormat = selectedFormat || supported[0];
  const result = store.query(query, { results_format: selectedFormat });
  return [result, selectedFormat] as [string, string];
};

export const GET: APIRoute = async ({ request, locals, redirect }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("query") || "";
  const accept = request.headers.get("Accept") || "";
  const acceptedTypes = parseAccept(accept);
  if (!query && acceptedTypes.some((at) => at.type === "text/html")) {
    return redirect("/sparql-playground");
  }

  try {
    const internalFetch = createFetch(locals.runtime.env);

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
      return new Response(`Bad Request: ${error.message}`, {
        status: 400,
      });
    }
    return new Response("Bad Request", { status: 400 });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const formData = await request.formData();
  const query = (formData.get("query") as string) || "";
  const accept = request.headers.get("Accept") || "";
  const acceptedTypes = parseAccept(accept);
  try {
    const internalFetch = createFetch(locals.runtime.env);
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
      return new Response(`Bad Request: ${error.message}`, {
        status: 400,
      });
    }
    return new Response("Bad Request", { status: 400 });
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
