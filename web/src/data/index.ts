import {
  _courseCategoryMap,
  _courseMap,
  _curriculumMap,
  _lectureMap,
} from "./education";
import {
  allOntologyClasses,
  ontologyClassMap,
  rootOntologyClasses,
} from "./ontology";
import { _linkedOrganizationMap, _organizationMap } from "./organizations";
import { _linkedPeopleMap, _peopleMap } from "./people";
import { _linkedSpatialMap, _spatialMap } from "./spatial";

for (const spatial of _spatialMap.values()) {
  const linkedSpatial = _linkedSpatialMap.get(spatial.id);
  if (!linkedSpatial) continue;
  for (const orgId of spatial.properties.managedBy ?? []) {
    const org = _organizationMap.get(orgId);
    const linkedOrg = _linkedOrganizationMap.get(orgId);
    if (!org || !linkedOrg) continue;
    org.manages ??= [];
    if (!org.manages.includes(spatial.id)) org.manages.push(spatial.id);
    if (!linkedOrg.manages.includes(linkedSpatial))
      linkedOrg.manages.push(linkedSpatial);
    if (!linkedSpatial.properties.managedBy.includes(linkedOrg))
      linkedSpatial.properties.managedBy.push(linkedOrg);
  }
}

export {
  _organizationMap as organizationMap,
  _linkedOrganizationMap as linkedOrganizationMap,
  _spatialMap as spatialMap,
  _linkedSpatialMap as linkedSpatialMap,
  _courseMap as courseMap,
  _courseCategoryMap as courseCategoryMap,
  _curriculumMap as curriculumMap,
  _lectureMap as lectureMap,
  _peopleMap as peopleMap,
  _linkedPeopleMap as linkedPeopleMap,
  ontologyClassMap,
  allOntologyClasses,
  rootOntologyClasses,
};
