import { defineCollection, z } from "astro:content";
import type { Lecture } from "generated/education";
import type { CourseCategoryCollection } from "generated/education_course_category_collection";
import type { CourseCollection } from "generated/education_course_collection";
import type { Curriculum } from "generated/education_curriculum";
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

const educationCourses = defineCollection({
  loader: () => {
    const files = import.meta.glob("../../data/education/courses.json", {
      eager: true,
      import: "default",
    }) as Record<string, CourseCollection>;

    return Object.values(files).flatMap(
      (data) =>
        data.entries?.map((entry) => ({ type: "Course", ...entry })) ?? [],
    );
  },
});

const educationCourseCategories = defineCollection({
  loader: () => {
    const files = import.meta.glob(
      "../../data/education/course_categories.json",
      {
        eager: true,
        import: "default",
      },
    ) as Record<string, CourseCategoryCollection>;

    return Object.values(files).flatMap(
      (data) => data.entries?.map((entry) => ({ ...entry })) ?? [],
    );
  },
});

const educationCurriculums = defineCollection({
  loader: () => {
    const files = import.meta.glob(
      "../../data/education/curriculums/**/*.json",
      {
        eager: true,
        import: "default",
      },
    ) as Record<string, Curriculum>;

    return Object.values(files).flatMap(
      (data) =>
        data.entries?.map((entry) => ({
          type: "CurriculumEntry",
          year: data.year,
          ...entry,
        })) ?? [],
    );
  },
});

const educationLectures = defineCollection({
  loader: () => {
    const files = import.meta.glob("../../data/education/lectures/**/*.json", {
      eager: true,
      import: "default",
    }) as Record<string, Lecture>;

    return Object.values(files).map((lecture) => ({
      ...lecture,
      type: "Lecture",
    }));
  },
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
  educationCourses,
  educationCourseCategories,
  educationCurriculums,
  educationLectures,
  ontologyClasses,
  ontologySlots,
};
