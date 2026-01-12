import type { APIRoute } from "astro";

export const GET: APIRoute = async () => {
  const contexts = import.meta.glob("../../../../generated/*.context.jsonld", {
    query: "?raw",
    eager: true,
  }) as Record<string, { default: string }>;
  const mergedContext = Object.values(contexts).reduce((acc, curr) => {
    const contextData = JSON.parse(curr.default);
    return Object.assign(acc, contextData["@context"]);
  }, {});

  return new Response(
    JSON.stringify({
      "@context": mergedContext,
    }),
    {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/ld+json",
      },
    },
  );
};
