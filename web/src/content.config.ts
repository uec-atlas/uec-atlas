import { defineCollection, z } from "astro:content";
import type { RawOrganization } from "./data/organizations";
import type { RawSpatialEntity } from "./data/spatial";

const organizations = defineCollection({
  loader: () => {
    const files = import.meta.glob("../../data/organizations/**/*.json", {
      eager: true,
      import: "default",
    }) as Record<string, RawOrganization>;

    return Object.values(files);
  },
  schema: z.custom<RawOrganization>(),
});

const spatial = defineCollection({
  loader: () => {
    const files = import.meta.glob("../../data/spatial/**/*.geojson", {
      eager: true,
      query: "raw",
      import: "default",
    }) as Record<string, string>;

    return Object.values(files).flatMap((data) => JSON.parse(data).features);
  },
  schema: z.custom<RawSpatialEntity>(),
});

export const collections = {
  organizations,
  spatial,
};
