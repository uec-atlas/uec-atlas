import { defineCollection, z } from "astro:content";
import ontologyData from "../generated/ontology_docs.json";
import type { OntologySlot, RawOntologyClass } from "./data/ontology";
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

const ontologyClasses = defineCollection({
  loader: () => {
    return Object.entries(ontologyData.classes).map(([id, value]) => ({
      id,
      ...value,
    }));
  },
  schema: z.custom<RawOntologyClass>(),
});

const ontologySlots = defineCollection({
  loader: () => {
    return Object.entries(ontologyData.slots).map(([id, value]) => ({
      id,
      ...value,
    }));
  },
  schema: z.custom<OntologySlot>(),
});

export const collections = {
  organizations,
  spatial,
  ontologyClasses,
  ontologySlots,
};
