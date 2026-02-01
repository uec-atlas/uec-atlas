import cloudflare from "@astrojs/cloudflare";
import svelte from "@astrojs/svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "astro/config";
import { iconSpritePlugin } from "./icon-plugin";

export default defineConfig({
  site: process.env.SITE,
  adapter: cloudflare(),
  output: "server",

  security: {
    checkOrigin: false,
  },

  integrations: [svelte()],
  vite: {
    plugins: [tailwindcss(), iconSpritePlugin()],
    optimizeDeps: {
      esbuildOptions: {
        target: "esnext",
      },
    },
    ssr: {
      external: ["eyereasoner"],
    },
    define: {
      __dirname: '""',
      __filename: '""',
    },
  },
});
