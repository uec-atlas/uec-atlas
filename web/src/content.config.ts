import { defineCollection, z } from "astro:content";
import type { Feature as FeatureSchema, FeatureCollection } from "../generated/room";
type Feature = FeatureSchema & {
  geometry: any
}
const rooms = defineCollection({
  loader: () => {
    const files = import.meta.glob("../../data/rooms/*.json", {
      eager: true,
    }) as Record<string, FeatureCollection>;
    return Object.values(files).flatMap((file) => file.features).toSorted((a, b) =>
      a.id.localeCompare(b.id)
    );
  },
  schema: z.custom<Feature>()
});

export const collections = {
  rooms,
};
