import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { Store } from "oxigraph";

const toFullURL = (path: string) =>
  new URL(path, process.env.SITE || "http://localhost:4321").toString();

const app = new Hono();

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

const nQuadURLs = [
  toFullURL("/data/organizations/all.nq"),
  toFullURL("/data/spatial/all.nq"),
  toFullURL("/data/education/courses.nq"),
  toFullURL("/data/education/categories.nq"),
  toFullURL("/data/education/curriculum.nq"),
  toFullURL("/data/education/lectures.nq"),
  toFullURL("/data/people/all.nq"),
];

const ontologyURLs = [
  toFullURL("/ontology/organizations.ttl"),
  toFullURL("/ontology/spatial.ttl"),
  toFullURL("/ontology/education.ttl"),
  toFullURL("/ontology/people.ttl"),
];

async function getStore() {
  if (cachedStore) return cachedStore;

  const store = new Store();

  for (const url of nQuadURLs) {
    const res = await fetch(url);
    if (!res.ok) continue;
    const nquads = await res.text();
    store.load(nquads, { format: "application/n-quads" });
  }

  for (const url of ontologyURLs) {
    const res = await fetch(url);
    if (!res.ok) continue;
    const ontology = await res.text();
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

const executeQuery = async (
  query: string,
  acceptedTypes: ReturnType<typeof parseAccept>,
) => {
  const store = await getStore();
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

app.get("/", async (ctx) => {
  const query = ctx.req.queries("query")?.[0] || "";
  const accept = ctx.req.header()["Accept"] || "";
  const acceptedTypes = parseAccept(accept);

  try {
    const [data, mediaType] = await executeQuery(query, acceptedTypes);
    const response = new Response(data, {
      headers: {
        "Content-Type": mediaType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600", // 1時間キャッシュなど、適宜調整
      },
    });
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
});

app.post("/", async (ctx) => {
  const formData = await ctx.req.formData();
  const query = (formData.get("query") as string) || "";
  const accept = ctx.req.header()["Accept"] || "";
  const acceptedTypes = parseAccept(accept);
  try {
    const [data, mediaType] = await executeQuery(query, acceptedTypes);
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
});

app.options("/", async () => {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Accept",
    },
  });
});

serve(app, (info) => {
  console.log(`SPARQL endpoint is running at http://localhost:${info.port}/`);
});
