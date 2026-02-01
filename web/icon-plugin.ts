import fs from "node:fs/promises";
import { createRequire } from "node:module";
import { getIconData, stringToIcon } from "@iconify/utils";
import type { Plugin } from "vite";

const require = createRequire(import.meta.url);

/**
 * Vite plugin to generate an SVG sprite from Iconify icons used in the project.
 * Scans for <Icon name="..." /> in Astro/Svelte and defineIcons([...]) in TS/JS.
 */
export function iconSpritePlugin(): Plugin {
  const iconIds = new Set<string>();
  const collections: Record<string, any> = {};

  let spriteCache = "";
  let lastIconCount = 0;
  let buildPromise: Promise<string> | null = null;

  async function getSprite(): Promise<string> {
    if (spriteCache && iconIds.size === lastIconCount) return spriteCache;

    return (buildPromise ??= (async () => {
      try {
        const sortedIds = [...iconIds].sort();
        let symbols = "";

        for (const fullId of sortedIds) {
          const parsed = stringToIcon(fullId);
          if (!parsed) continue;

          if (!collections[parsed.prefix]) {
            try {
              const pkg = require.resolve(
                `@iconify-json/${parsed.prefix}/icons.json`,
              );
              collections[parsed.prefix] = JSON.parse(
                await fs.readFile(pkg, "utf-8"),
              );
            } catch {
              continue;
            }
          }

          const data = getIconData(collections[parsed.prefix], parsed.name);
          if (data) {
            symbols += `<symbol id="${fullId}" viewBox="0 0 ${data.width || 24} ${data.height || 24}">${data.body}</symbol>`;
          }
        }

        const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display: none;">${symbols}</svg>`;
        if (sortedIds.length === iconIds.size) {
          spriteCache = sprite;
          lastIconCount = sortedIds.length;
        }
        return sprite;
      } finally {
        buildPromise = null;
      }
    })());
  }

  return {
    name: "icon-sprite-plugin",
    enforce: "pre",
    async transform(code: string, id: string) {
      if (id.includes("node_modules") || !/\.(svelte|astro|ts|js)$/.test(id))
        return null;

      const [filePath] = id.split("?");
      const content =
        filePath.endsWith(".astro") || filePath.endsWith(".svelte")
          ? await fs.readFile(filePath, "utf-8").catch(() => code) // codeがすでにトランスパイル済みの場合があるため
          : code;

      for (const [, name] of content.matchAll(
        /<Icon\s+[^>]*?name=["']([^"']+)["'][^>]*?\/?>/gi,
      )) {
        iconIds.add(name);
      }

      // Extract icons from defineIcons([...])
      for (const [, list] of content.matchAll(
        /defineIcons\s*\(\s*\[([\s\S]*?)\]\s*\)/g,
      )) {
        for (const [, name] of list.matchAll(/["']([^"']+)["']/g))
          iconIds.add(name);
      }

      return null;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== "/_astro/icons-sprite.svg") return next();
        res.setHeader("Content-Type", "image/svg+xml");
        res.end(await getSprite());
      });
    },
    async generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "_astro/icons-sprite.svg",
        source: await getSprite(),
      });
    },
  } satisfies Plugin;
}

export const defineIcons = (_icons: string[]) => {};
