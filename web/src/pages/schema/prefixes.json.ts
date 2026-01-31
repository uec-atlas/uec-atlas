import prefixes from "@/assets/prefixes.json";

export const GET = async () => {
  return new Response(JSON.stringify(prefixes), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  });
};
