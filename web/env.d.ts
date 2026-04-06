type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
interface Env {
  SITE: string;
  SPARQL_ENDPOINT: string;
  ASSETS: {
    fetch: typeof globalThis.fetch;
  };
  SELF: {
    fetch: typeof globalThis.fetch;
  };
}

declare module "*.wasm" {
  const content: WebAssembly.Module;
  export default content;
}
