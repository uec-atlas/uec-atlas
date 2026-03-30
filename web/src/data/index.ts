import {
  _courseCategoryMap,
  _courseMap,
  _curriculumMap,
  _educationMap,
  _lectureMap,
  _linkedCourseMap,
  _linkedEducationMap,
  _linkedLectureMap,
} from "./education";
import {
  allOntologyClasses,
  ontologyClassMap,
  rootOntologyClasses,
} from "./ontology";
import {
  _linkedOrganizationMap,
  _organizationMap,
  type LinkedOrganization,
} from "./organizations";
import { _linkedPeopleMap, _peopleMap, type LinkedPerson } from "./people";
import { _linkedSpatialMap, _spatialMap } from "./spatial";

const linkOrganizationAndSpatial = (orgId: string, spatialId: string) => {
  const org = _organizationMap.get(orgId);
  const linkedOrg = _linkedOrganizationMap.get(orgId);
  const spatial = _spatialMap.get(spatialId);
  const linkedSpatial = _linkedSpatialMap.get(spatialId);
  if (!org || !linkedOrg || !spatial || !linkedSpatial) return;

  org.manages ??= [];
  if (!org.manages.includes(spatial.id)) org.manages.push(spatial.id);

  spatial.properties.managedBy ??= [];
  if (!spatial.properties.managedBy.includes(org.id)) {
    spatial.properties.managedBy.push(org.id);
  }

  if (!linkedOrg.manages.includes(linkedSpatial)) {
    linkedOrg.manages.push(linkedSpatial);
  }
  if (!linkedSpatial.properties.managedBy.includes(linkedOrg)) {
    linkedSpatial.properties.managedBy.push(linkedOrg);
  }
};

for (const spatial of _spatialMap.values()) {
  for (const orgId of spatial.properties.managedBy ?? []) {
    linkOrganizationAndSpatial(orgId, spatial.id);
  }
}

for (const org of _organizationMap.values()) {
  for (const spatialId of org.manages ?? []) {
    linkOrganizationAndSpatial(org.id, spatialId);
  }
}

for (const person of _peopleMap.values()) {
  const linkedMemberOf: LinkedOrganization[] = [];
  for (const orgId of person.memberOf ?? []) {
    const linkedOrg = _linkedOrganizationMap.get(orgId);
    if (linkedOrg) linkedMemberOf.push(linkedOrg);
  }
  const linkedPerson: LinkedPerson = {
    ...person,
    memberOf: linkedMemberOf,
  };
  _linkedPeopleMap.set(person.id, linkedPerson);
  person.memberOf = person.memberOf ?? [];
  for (const linkedOrg of linkedMemberOf) {
    if (!linkedOrg.member.includes(linkedPerson)) {
      linkedOrg.member.push(linkedPerson);
    }
    if (!person.memberOf.includes(linkedOrg.id)) {
      person.memberOf.push(linkedOrg.id);
    }
  }
  for (const lecture of _lectureMap.values()) {
    const linkedLecture = _linkedLectureMap.get(lecture.id);
    if (!linkedLecture) continue;
    if (lecture.instructors?.some((instructor) => instructor === person.id)) {
      lecture.instructors ??= [];
      if (!lecture.instructors.includes(person.id)) {
        lecture.instructors.push(person.id);
      }
      if (!linkedLecture.instructors.includes(linkedPerson)) {
        linkedLecture.instructors.push(linkedPerson);
      }
    }
  }
}

export {
  _courseCategoryMap as courseCategoryMap,
  _courseMap as courseMap,
  _curriculumMap as curriculumMap,
  _educationMap as educationMap,
  _lectureMap as lectureMap,
  _linkedCourseMap as linkedCourseMap,
  _linkedEducationMap as linkedEducationMap,
  _linkedLectureMap as linkedLectureMap,
  _linkedOrganizationMap as linkedOrganizationMap,
  _linkedPeopleMap as linkedPeopleMap,
  _linkedSpatialMap as linkedSpatialMap,
  _organizationMap as organizationMap,
  _peopleMap as peopleMap,
  _spatialMap as spatialMap,
  allOntologyClasses,
  ontologyClassMap,
  rootOntologyClasses,
};
