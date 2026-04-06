import type { APIRoute } from "astro";
import { initOxigraph, Store } from "@/utils/oxigraph";
import { toFullURL } from "@/utils/url";
import { ontologyFiles } from "./ontology/[path].ttl";

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
    toFullURL("/data/education/courses.nq"),
    toFullURL("/data/education/categories.nq"),
    toFullURL("/data/education/curriculum.nq"),
    toFullURL("/data/education/lectures.nq"),
    toFullURL("/data/people/all.nq"),
  ];

  const store = new Store();

  for (const url of nQuadURLs) {
    const res = await runtimeFetch(url);
    if (!res.ok) continue;

    // ストリームを利用してメモリ消費を抑えて読み込む
    const nquads = await res.text();

    // 行ごとに分割して不要なリソースをフィルタリングしつつロード
    // ただし、Oxigraphのloadは一気に渡すのが早いので、ここでは単なる空行削除程度に留める
    const cleanedNquads = nquads
      .split("\n")
      .filter((line) => line.trim().length > 0 && !line.trim().startsWith("#"))
      .join("\n");

    store.load(cleanedNquads, { format: "application/n-quads" });
  }
  const ontologyList = Object.values(ontologyFiles);

  for (const ontology of ontologyList) {
    store.load(ontology, { format: "text/turtle" });
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

  try {
    const result = store.query(query, { results_format: selectedFormat });
    return [result, selectedFormat] as [string, string];
  } catch (error) {
    if (error instanceof Error && error.message.includes("out of memory")) {
      cachedStore = null;
    }
    throw error;
  }
};

export const GET: APIRoute = async ({ request, locals, redirect }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("query") || "";
  const accept = request.headers.get("Accept") || "";
  const acceptedTypes = parseAccept(accept);

  if (!query && acceptedTypes.some((at) => at.type === "text/html")) {
    return redirect("/sparql-playground");
  }

  // GETリクエストのみCache APIを利用
  const cache = await (caches as any).default;
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const internalFetch = createFetch(locals.runtime.env);

    const [data, mediaType] = await executeQuery(
      query,
      internalFetch,
      acceptedTypes,
    );
    const response = new Response(data, {
      headers: {
        "Content-Type": mediaType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600", // 1時間キャッシュなど、適宜調整
      },
    });

    if (query) {
      // 成功したクエリ結果のみキャッシュに保存
      locals.runtime.ctx.waitUntil(cache.put(request, response.clone()));
    }
    return response;
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
