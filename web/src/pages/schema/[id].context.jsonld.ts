import type { APIRoute } from "astro";
import type { ContextDefinition, JsonLdDocument, NodeObject } from "jsonld";

export const prerender = true;

const files = import.meta.glob("../../../../generated/*.context.jsonld", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const getStaticPaths = async () => {
  return Object.keys(files).map((item) => ({
    params: { id: item.split("/").pop()?.replace(".context.jsonld", "") },
  }));
};

export const getContext = async (id?: string) => {
  const file = Object.entries(files).find(([key]) => key.endsWith(`${id}.context.jsonld`));
  return file ? (JSON.parse(file[1]) as { "@context": ContextDefinition }) : null;
};

export const resolveContext = async <T extends JsonLdDocument>(doc: T): Promise<T> => {
  if (Array.isArray(doc)) return Promise.all(doc.map(resolveContext)) as never;
  if (typeof doc !== "object" || !doc || !("@context" in doc)) return doc;

  const res = async (c: unknown) => {
    if(typeof c !== "string") return c;
    const url = new URL(c);
    const id = url.pathname.split("/").pop()?.replace(".context.jsonld", "");
    const context = await getContext(id);
    return context?.["@context"] ?? c;
  }

  const ctx = (doc as NodeObject)["@context"];
  return {
    ...doc,
    "@context": Array.isArray(ctx) ? await Promise.all(ctx.map(res)) : await res(ctx),
  } as T;
};

export const GET: APIRoute = async ({ params }) => {
  const id = params.id;
  const context = await getContext(id);
  if (!context) {
    return new Response("Not Found", { status: 404 });
  }
  return new Response(JSON.stringify(context), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/ld+json",
    },
  });
};
