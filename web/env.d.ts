type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime { }
}
interface Env {
  SITE: string;
  SELF: {
    fetch: typeof globalThis.fetch;
  };
}
