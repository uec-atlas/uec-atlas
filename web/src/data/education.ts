import { getCollection } from "astro:content";
import type {
  Course,
  CourseCategory,
  CoursePrerequisite,
  CurriculumEntry,
  Lecture,
} from "generated/education";
import { formatI18NString } from "@/utils/rdf";
import type { LinkedOrganization } from "./organizations";
import { _linkedOrganizationMap } from "./organizations";
import type { LinkedPerson } from "./people";

interface CoursePrerequisiteEntry {
  category?: string;
  checkpoint?: string;
  course?: string;
  targets: {
    organizations: string[];
    courses: string[];
  }[];
}

interface CourseSuccessorEntry {
  from: string;
  to: string;
}

export type LinkedCourse = Omit<Course, "lectures"> & {
  lectures: LinkedLecture[];
};

export type LinkedLecture = Omit<Lecture, "courses" | "instructors"> & {
  courses: LinkedCourse[];
  instructors: LinkedPerson[];
};

const coursePrerequisites = Object.values(
  import.meta.glob("../../../data/education/course_prerequisites.json", {
    eager: true,
    import: "default",
  }),
)[0] as CoursePrerequisiteEntry[];

const courseSuccessors = Object.values(
  import.meta.glob("../../../data/education/course_successors.json", {
    eager: true,
    import: "default",
  }),
)[0] as CourseSuccessorEntry[];

export const _courseMap = new Map<string, Course>();
export const _courseCategoryMap = new Map<string, CourseCategory>();
export const _curriculumMap = new Map<string, CurriculumEntry>();
export const _lectureMap = new Map<string, Lecture>();
export const _educationMap = new Map<
  string,
  Course | CourseCategory | CurriculumEntry | Lecture
>();
export const _linkedCourseMap = new Map<string, LinkedCourse>();
export const _linkedLectureMap = new Map<string, LinkedLecture>();
export const _linkedEducationMap = new Map<
  string,
  LinkedCourse | CourseCategory | CurriculumEntry | LinkedLecture
>();

const courses = await getCollection("educationCourses");
for (const course of courses) {
  const courseData: Course = {
    ...course.data,
  };
  courseData.codeMappings ??= [];
  courseData.lectures ??= [];
  courseData.organizations ??= [];
  courseData.prerequisites ??= [];
  _courseMap.set(course.id, courseData);
  _linkedCourseMap.set(course.id, {
    ...courseData,
    lectures: [],
  });
}

const courseCategories = await getCollection("educationCourseCategories");
for (const category of courseCategories) {
  _courseCategoryMap.set(category.id, category.data as CourseCategory);
}

for (const category of _courseCategoryMap.values()) {
  if (category.subCategoryOf) {
    const parentCategory = _courseCategoryMap.get(category.subCategoryOf);
    if (parentCategory) {
      parentCategory.hasSubCategory ??= [];
      if (!parentCategory.hasSubCategory.includes(category.id)) {
        parentCategory.hasSubCategory.push(category.id);
      }
    }
  }
}

const curriculums = await getCollection("educationCurriculums");
for (const curriculum of curriculums) {
  _curriculumMap.set(curriculum.id, curriculum.data as CurriculumEntry);
}

const lectures = await getCollection("educationLectures");
for (const lecture of lectures) {
  const lectureData: Lecture = {
    ...lecture.data,
  };
  lectureData.instructors ??= [];
  lectureData.courses ??= [];
  _lectureMap.set(lecture.id, lectureData);
  _linkedLectureMap.set(lecture.id, {
    ...lectureData,
    courses: [],
    instructors: [],
  });
}

for (const entry of [
  ..._courseMap.values(),
  ..._courseCategoryMap.values(),
  ..._curriculumMap.values(),
  ..._lectureMap.values(),
]) {
  _educationMap.set(entry.id, entry);
}

for (const entry of [
  ..._linkedCourseMap.values(),
  ..._courseCategoryMap.values(),
  ..._curriculumMap.values(),
  ..._linkedLectureMap.values(),
]) {
  _linkedEducationMap.set(entry.id, entry);
}

for (const lecture of _lectureMap.values()) {
  const linkedLecture = _linkedLectureMap.get(lecture.id);
  if (!linkedLecture) continue;
  for (const courseId of lecture.courses ?? []) {
    const course = _courseMap.get(courseId);
    const linkedCourse = _linkedCourseMap.get(courseId);
    if (!course || !linkedCourse) continue;
    course.lectures ??= [];
    if (!course.lectures.includes(lecture.id)) {
      course.lectures.push(lecture.id);
    }
    linkedCourse.lectures.push(linkedLecture);
    if (linkedLecture && !linkedLecture.courses.includes(linkedCourse)) {
      linkedLecture.courses.push(linkedCourse);
    }
  }
}

const years = new Set<number>([]);

for (const curriculum of _curriculumMap.values()) {
  years.add(curriculum.year);
}

for (const { from, to } of courseSuccessors) {
  const fromCourse = _courseMap.get(from);
  const toCourse = _courseMap.get(to);
  if (!fromCourse || !toCourse) continue;

  fromCourse.succeededBy = to;
}

// 名前からIDへのマッピングを作成
const courseNameIdsMap = new Map<string, string[]>();
for (const course of _courseMap.values()) {
  const nameJa = formatI18NString(course.name, "ja");
  if (nameJa) {
    const list = courseNameIdsMap.get(nameJa) ?? [];
    list.push(course.id);
    courseNameIdsMap.set(nameJa, list);
  }
}

const categoryNameMap = new Map<string, string>();
for (const category of _courseCategoryMap.values()) {
  const nameJa = formatI18NString(category.name, "ja");
  if (nameJa) categoryNameMap.set(nameJa, category.id);
}

const organizationNameMap = new Map<string, string>();
for (const org of _linkedOrganizationMap.values()) {
  const nameJa = formatI18NString(org.name, "ja");
  if (nameJa) organizationNameMap.set(nameJa, org.id);
}

const curriculumEntryNameMap = new Map<string, CurriculumEntry[]>();
for (const curriculum of _curriculumMap.values()) {
  const nameJa = formatI18NString(curriculum.name, "ja");
  if (nameJa) {
    const list = curriculumEntryNameMap.get(nameJa) ?? [];
    list.push(curriculum);
    curriculumEntryNameMap.set(nameJa, list);
  }
}

for (const { category, checkpoint, course, targets } of coursePrerequisites) {
  for (const year of Array.from(years)) {
    for (const target of targets) {
      const leafTargetOrgIds = target.organizations
        .map((orgName) => organizationNameMap.get(orgName))
        .filter((id): id is string => id !== undefined);

      const targetOrgIdSet = new Set<string>();

      const getParentOrgIds = (org: LinkedOrganization | undefined) => {
        if (!org) return [];
        const parentOrgIds: string[] = [];
        const queue = [org];
        while (queue.length > 0) {
          const current = queue.shift();
          if (!current) continue;
          parentOrgIds.push(current.id);
          for (const parent of current.subOrganizationOf ?? []) {
            queue.push(parent);
          }
        }
        return parentOrgIds;
      };

      for (const orgId of leafTargetOrgIds) {
        const org = _linkedOrganizationMap.get(orgId);
        if (!org) continue;
        for (const parentOrgId of getParentOrgIds(org)) {
          targetOrgIdSet.add(parentOrgId);
        }
      }
      const targetOrgIds = Array.from(targetOrgIdSet);

      for (const targetCourseName of target.courses) {
        const targetCourseIds = courseNameIdsMap.get(targetCourseName) ?? [];
        for (const targetCourseId of targetCourseIds) {
          const targetCourse = _courseMap.get(targetCourseId);
          if (!targetCourse) continue;

          const prereq: CoursePrerequisite = { year };

          if (category) {
            const categoryId = categoryNameMap.get(category);
            if (categoryId) prereq.category = categoryId;
          }

          if (checkpoint) {
            const entries = curriculumEntryNameMap.get(checkpoint) ?? [];
            const entry = entries.find(
              (e) =>
                targetOrgIds.includes(e.targetOrganization) && e.year === year,
            );
            if (entry) prereq.checkpoint = entry.id;
          }

          if (course) {
            const entries = curriculumEntryNameMap.get(course) ?? [];
            const entry = entries.find(
              (e) =>
                targetOrgIds.includes(e.targetOrganization) && e.year === year,
            );
            if (entry) {
              prereq.course = entry.id;
            } else {
              const courseIds = courseNameIdsMap.get(course) ?? [];
              if (courseIds.length > 0) prereq.course = courseIds[0];
            }
          }

          if (
            !prereq.category &&
            !prereq.checkpoint &&
            !prereq.course &&
            !prereq.year
          )
            continue;

          targetCourse.prerequisites ??= [];
          const isDuplicated = targetCourse.prerequisites.some(
            (p) =>
              p.year === prereq.year &&
              p.category === prereq.category &&
              p.checkpoint === prereq.checkpoint &&
              p.course === prereq.course,
          );
          if (!isDuplicated) {
            targetCourse.prerequisites.push(prereq);
          }
        }
      }
    }
  }
}
