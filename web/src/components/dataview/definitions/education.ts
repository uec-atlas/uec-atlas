import type {
  Checkpoint,
  CodeMapping,
  Course,
  CourseCategory,
  CourseCategoryMapping,
  CurriculumEntry,
  I18NString,
  Lecture,
} from "generated/education";
import { courseMap, curriculumMap, organizationMap } from "@/data";
import type { LinkedCourse, LinkedLecture } from "@/data/education";
import { courseCategoryMap } from "@/data/index";
import { formatI18NString } from "@/utils/rdf";
import { expandURI } from "@/utils/url";
import LectureMetadataView from "../LectureMetadataView.astro";
import LinkCardList from "../LinkCardList.astro";
import Paragraph from "../Paragraph.astro";
import SimpleList from "../SimpleList.astro";
import { defineDataViewItems } from "../types";

const getFormatCodeMapping = (mapping: CodeMapping[] | undefined): string[] => {
  if (!mapping) return [];
  const codeMap = new Map<string, Set<number>>();
  for (const m of mapping) {
    if (m.years) {
      if (!codeMap.has(m.code)) {
        codeMap.set(m.code, new Set());
      }
      for (const year of m.years) {
        codeMap.get(m.code)?.add(year);
      }
    }
  }

  return Array.from(codeMap.entries()).map(([code, years]) => {
    if (years.size > 0) {
      return `${code} (${Array.from(years).join(", ")}年度版)`;
    }
    return code;
  });
};

const getPrerequisiteList = (
  prerequisites: Course["prerequisites"],
): string[] => {
  if (!prerequisites) return [];
  const prerequisiteMap: Map<string, Set<number>> = new Map();
  for (const prereq of prerequisites) {
    if (prereq.year === undefined) continue;
    if (prereq.course) {
      const course = courseMap.get(prereq.course);
      if (course) {
        const label = `${formatI18NString(course.name)}を履修していること`;
        prerequisiteMap.set(
          label,
          (prerequisiteMap.get(label) ?? new Set()).add(prereq.year),
        );
      }
    }
    if (prereq.category) {
      const category = courseCategoryMap.get(prereq.category);
      if (category) {
        const label = `${formatI18NString(category.name)}を履修していること`;
        prerequisiteMap.set(
          label,
          (prerequisiteMap.get(label) ?? new Set()).add(prereq.year),
        );
      }
    }
    if (prereq.checkpoint) {
      const checkpoint = curriculumMap.get(prereq.checkpoint);
      if (!checkpoint) continue;
      const label = `${formatI18NString(checkpoint.name)}を満たしていること`;
      prerequisiteMap.set(
        label,
        (prerequisiteMap.get(label) ?? new Set()).add(prereq.year),
      );
    }
  }
  return Array.from(prerequisiteMap.entries()).map(([label, years]) => {
    if (years.size > 0) {
      return `${label} (${Array.from(years).join(", ")}年度版)`;
    }
    return label;
  });
};

export const courseDataView = defineDataViewItems<LinkedCourse>()(
  ({ componentItem, sectionItem }) => [
    sectionItem({
      type: "section",
      title: "後継科目",
      when: (value) => !!value.succeededBy,
      items: [
        componentItem({
          type: "component",
          component: LinkCardList,
          props: (value) => {
            const successorCourse = courseMap.get(value.succeededBy ?? "");
            return {
              items: [
                {
                  name: successorCourse?.name ?? "不明な科目",
                  uri: expandURI(successorCourse?.id ?? ""),
                },
              ],
              fallbackName: {
                ja: "無名の科目",
                en: "Unnamed Course",
              },
            };
          },
        }),
      ],
    }),
    sectionItem({
      type: "section",
      title: "科目コード(学修要覧)",
      when: (value) => !!value.codeMappings && value.codeMappings.length > 0,
      items: [
        componentItem({
          type: "component",
          component: SimpleList,
          props: (value) => ({
            items: getFormatCodeMapping(value.codeMappings),
          }),
        }),
      ],
    }),
    sectionItem({
      type: "section",
      title: "履修要件",
      when: (value) => !!value.prerequisites && value.prerequisites.length > 0,
      items: [
        componentItem({
          type: "component",
          component: SimpleList,
          props: (value) => ({
            items: getPrerequisiteList(value.prerequisites),
          }),
        }),
      ],
    }),
    sectionItem({
      type: "section",
      title: "開講組織",
      when: (value) =>
        Array.isArray(value.organizations) && value.organizations.length > 0,
      items: [
        componentItem({
          type: "component",
          component: LinkCardList,
          props: (value) => ({
            items:
              value.organizations
                ?.map((orgId) => organizationMap.get(orgId))
                .filter((org) => !!org)
                .map((org) => ({
                  name: org.name,
                  uri: org.id,
                })) ?? [],
            fallbackName: {
              ja: "無名の組織",
              en: "Unnamed Organization",
            },
          }),
        }),
      ],
    }),
    sectionItem({
      type: "section",
      title: "対応する講義",
      when: (value) =>
        Array.isArray(value.lectures) && value.lectures.length > 0,
      items: [
        componentItem({
          type: "component",
          component: LinkCardList,
          props: (value) => ({
            items:
              value.lectures?.map((lecture) => ({
                name: lecture.name
                  ? `${lecture.name?.ja} (教員: ${lecture.instructors.map((inst) => inst.name?.ja).join(", ")})`
                  : "無名の講義",
                uri: lecture.id,
              })) ?? [],
            fallbackName: {
              ja: "無名の講義",
              en: "Unnamed Lecture",
            },
          }),
        }),
      ],
    }),
  ],
);

export const courseCategoryDataView = defineDataViewItems<CourseCategory>()(
  ({ componentItem, sectionItem }) => [
    sectionItem({
      type: "section",
      title: "上位区分",
      when: (value) => !!value.subCategoryOf,
      items: [
        componentItem({
          type: "component",
          component: LinkCardList,
          props: (value) => {
            const parentCategory = courseCategoryMap.get(
              value.subCategoryOf ?? "",
            );
            return {
              items: [
                {
                  name: parentCategory?.name ?? "不明な区分",
                  uri: expandURI(parentCategory?.id ?? ""),
                },
              ],
              fallbackName: {
                ja: "無名の区分",
                en: "Unnamed Category",
              },
            };
          },
        }),
      ],
    }),
    sectionItem({
      type: "section",
      title: "下位区分",
      when: (value) =>
        Array.isArray(value.hasSubCategory) && value.hasSubCategory.length > 0,
      items: [
        componentItem({
          type: "component",
          component: LinkCardList,
          props: (value) => ({
            items:
              value.hasSubCategory
                ?.map((id) => courseCategoryMap.get(id))
                .filter((cat) => !!cat)
                .map((cat) => ({
                  name: cat.name,
                  uri: cat.id,
                })) ?? [],
            fallbackName: {
              ja: "無名の区分",
              en: "Unnamed Category",
            },
          }),
        }),
      ],
    }),
  ],
);

export const curriculumEntryDataView = defineDataViewItems<CurriculumEntry>()(
  ({ componentItem, sectionItem }) => [
    sectionItem({
      type: "section",
      title: "対象組織",
      when: (value) => !!value.targetOrganization,
      items: [
        componentItem({
          type: "component",
          component: LinkCardList,
          props: (value) => {
            const organization = organizationMap.get(
              value.targetOrganization ?? "",
            );
            return {
              items: [
                {
                  name: organization?.name ?? "不明な組織",
                  uri: expandURI(organization?.id ?? ""),
                },
              ],
              fallbackName: {
                ja: "無名の組織",
                en: "Unnamed Organization",
              },
            };
          },
        }),
      ],
    }),
    sectionItem({
      type: "section",
      title: "対象学年",
      when: (value) =>
        Array.isArray(value.targetGrades) && value.targetGrades.length > 0,
      items: [
        componentItem({
          type: "component",
          component: SimpleList,
          props: (value) => ({
            items: value.targetGrades?.map((grade) => `${grade}年生`) ?? [],
          }),
        }),
      ],
    }),
    sectionItem({
      type: "section",
      title: "対象入学年度",
      when: (value) => !!value.year,
      items: [
        componentItem({
          type: "component",
          component: Paragraph,
          props: (value) => ({
            value: `${value.year}年度`,
          }),
        }),
      ],
    }),
    sectionItem({
      type: "section",
      title: "科目区分の指定",
      when: (value) => value.type === "CourseCategoryMapping",
      items: [
        componentItem({
          type: "component",
          component: LinkCardList,
          props: (value) => {
            const categoryMapping = value as CourseCategoryMapping;
            const category = courseCategoryMap.get(categoryMapping.category);
            return {
              items: [
                {
                  name: category?.name ?? "不明な区分",
                  uri: expandURI(category?.id ?? ""),
                },
              ],
              fallbackName: {
                ja: "無名の区分",
                en: "Unnamed Category",
              },
            };
          },
        }),
        componentItem({
          type: "component",
          component: LinkCardList,
          props: (value) => {
            const categoryMapping = value as CourseCategoryMapping;
            const courses =
              categoryMapping.courses
                ?.map((id) => courseMap.get(id))
                .filter((course) => !!course)
                .map((course) => ({
                  name: course.name,
                  uri: course.id,
                })) ?? [];
            return {
              items: courses,
              fallbackName: {
                ja: "無名の科目",
                en: "Unnamed Course",
              },
            };
          },
        }),
      ],
    }),
    sectionItem({
      type: "section",
      title: "履修審査における必修科目",
      when: (value) => value.type === "Checkpoint",
      items: [
        componentItem({
          type: "component",
          component: LinkCardList,
          props: (value) => {
            const checkpoint = value as Checkpoint;
            const courses =
              checkpoint.courseRequirements
                ?.map((id) => courseMap.get(id))
                .filter((course) => !!course)
                .map((course) => ({
                  name: course.name,
                  uri: course.id,
                })) ?? [];
            return {
              items: courses,
              fallbackName: {
                ja: "無名の科目",
                en: "Unnamed Course",
              },
            };
          },
        }),
        componentItem({
          type: "component",
          component: LinkCardList,
          when: (value) => value.items.length > 0,
          props: (value) => {
            const checkpoint = value as Checkpoint;
            const categoryRequirements =
              checkpoint.categoryRequirements
                ?.flatMap((req) => {
                  const categories =
                    req.targetCategories
                      ?.map((id) => courseCategoryMap.get(id))
                      .filter((cat) => !!cat) ?? [];
                  return categories.map((cat) => ({
                    name: `${formatI18NString(cat.name)}を${req.minCredits ? `${req.minCredits}単位以上` : ""}履修していること`,
                    uri: cat.id,
                  }));
                })
                .filter((v) => !!v) ?? [];
            return {
              items: categoryRequirements,
            };
          },
        }),
      ],
    }),
  ],
);

export const lectureDataView = defineDataViewItems<LinkedLecture>()(
  ({ componentItem, sectionItem }) => [
    componentItem({
      type: "component",
      component: LectureMetadataView,
      props: (value) => ({
        lecture: value,
      }),
    }),
    sectionItem({
      type: "section",
      title: "対応する科目定義",
      when: (value) => Array.isArray(value.courses) && value.courses.length > 0,
      items: [
        componentItem({
          type: "component",
          component: LinkCardList,
          props: (value) => ({
            items:
              value.courses.map((course) => ({
                name: `${course.name?.ja} (${[...new Set(course.codeMappings?.map((cm) => cm.code))].join(", ")})`,
                uri: course.id,
              })) ?? [],
            fallbackName: {
              ja: "無名の科目",
              en: "Unnamed Course",
            },
          }),
        }),
      ],
    }),
    sectionItem({
      type: "section",
      title: "担当教員",
      when: (value) =>
        Array.isArray(value.instructors) && value.instructors.length > 0,
      items: [
        componentItem({
          type: "component",
          component: LinkCardList,
          props: (value) => ({
            items:
              value.instructors
                ?.map((person) => ({
                  name: person.name,
                  uri: person.id,
                }))
                .filter(
                  (item): item is { name: I18NString; uri: string } =>
                    item !== null,
                ) ?? [],
            fallbackName: {
              ja: "無名の教員",
              en: "Unnamed Instructor",
            },
          }),
        }),
      ],
    }),
  ],
);

export const allEducationDataView = defineDataViewItems<{
  items: (Course | CourseCategory | CurriculumEntry | Lecture)[];
}>()(({ componentItem }) => [
  componentItem({
    type: "component",
    component: LinkCardList,
    props: (value) => ({
      items: value.items.map((item) => ({
        name: "name" in item ? item.name : "無名の項目",
        uri: "id" in item ? item.id : "",
        tags: "type" in item ? [item.type] : [],
      })),
      fallbackName: {
        ja: "無名の項目",
        en: "Unnamed Item",
      },
    }),
  }),
]);
