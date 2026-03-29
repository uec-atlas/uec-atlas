import { getCollection } from "astro:content";
import type { Organization } from "generated/organization";

export type RawOrganization = Omit<
  Organization,
  | "hasSubOrganization"
  | "subOrganizationOf"
  | "relatedTo"
  | "manages"
  | "member"
> & {
  hasSubOrganization?: string[];
  subOrganizationOf?: string[];
  relatedTo?: { type: string; target: string }[];
  manages?: string[];
  member?: string[];
};

export type LinkedOrganization = Omit<
  Organization,
  | "hasSubOrganization"
  | "subOrganizationOf"
  | "relatedTo"
  | "manages"
  | "member"
> & {
  hasSubOrganization: LinkedOrganization[];
  subOrganizationOf: LinkedOrganization[];
  relatedTo: { type: string; target: LinkedOrganization }[];
  manages: LinkedSpatialEntity[];
  member: LinkedPerson[];
};

const organizationTypeOrder = [
  "University",
  "School",
  "GraduateSchool",
  "Cluster",
  "Department",
  "EducationProgram",
  "ExternalOrganization",
];

export const organizationSorter = (
  a: RawOrganization | LinkedOrganization,
  b: RawOrganization | LinkedOrganization,
) => {
  const aTypeIndex = organizationTypeOrder.indexOf(a.type);
  const bTypeIndex = organizationTypeOrder.indexOf(b.type);
  if (aTypeIndex !== bTypeIndex) {
    if (aTypeIndex === -1) return 1;
    if (bTypeIndex === -1) return -1;
    return aTypeIndex - bTypeIndex;
  }
  const nameA = formatI18NString(a.name);
  const nameB = formatI18NString(b.name);
  if (nameA < nameB) return -1;
  if (nameA > nameB) return 1;
  return 0;
};

import { formatI18NString } from "@/utils/rdf";
import { _peopleMap, type LinkedPerson } from "./people";
import type { LinkedSpatialEntity } from "./spatial";
import { _spatialMap } from "./spatial";

const rawOrganizations = await getCollection("organizations");

const tempMap = new Map<
  string,
  {
    hasSubOrganization: Set<string>;
    subOrganizationOf: Set<string>;
    relatedTo: Map<string, string>;
    manages: Set<string>;
    member: Set<string>;
  }
>();

for (const { data } of rawOrganizations) {
  tempMap.set(data.id, {
    hasSubOrganization: new Set(data.hasSubOrganization ?? []),
    subOrganizationOf: new Set(data.subOrganizationOf ?? []),
    relatedTo: new Map(
      (data.relatedTo ?? []).map((r) => [r.type + r.target, r.type]),
    ),
    manages: new Set(data.manages ?? []),
    member: new Set(data.member ?? []),
  });
}

for (const { data } of rawOrganizations) {
  const orgId = data.id;
  for (const subId of data.hasSubOrganization ?? []) {
    tempMap.get(subId)?.subOrganizationOf.add(orgId);
  }
  for (const parentId of data.subOrganizationOf ?? []) {
    tempMap.get(parentId)?.hasSubOrganization.add(orgId);
  }
  // for (const rel of data.relatedTo ?? []) {
  //   tempMap.get(rel.target)?.related.set(rel.type + orgId, rel.type);
  // }
  for (const spatial of _spatialMap.values()) {
    if (spatial.properties.managedBy?.some((manager) => manager === orgId)) {
      tempMap.get(orgId)?.manages.add(spatial.id);
    }
  }
  for (const person of _peopleMap.values()) {
    if (person.memberOf?.some((memberOrgId) => memberOrgId === orgId)) {
      tempMap.get(orgId)?.member.add(person.id);
    }
  }
}

const baseDataMap = new Map<string, RawOrganization>();
const linkedOrgMap = new Map<string, LinkedOrganization>();

for (const { data } of rawOrganizations) {
  const temp = tempMap.get(data.id);
  if (!temp) continue;
  const raw: RawOrganization = {
    ...data,
    hasSubOrganization: Array.from(temp.hasSubOrganization),
    subOrganizationOf: Array.from(temp.subOrganizationOf),
    relatedTo: Array.from(temp.relatedTo, ([key, type]) => ({
      type,
      target: key.slice(type.length),
    })),
    manages: Array.from(temp.manages),
    member: Array.from(temp.member),
  };
  baseDataMap.set(data.id, raw);
  linkedOrgMap.set(data.id, {
    ...raw,
    hasSubOrganization: [],
    subOrganizationOf: [],
    relatedTo: [],
    manages: [],
    member: [],
  });
}

for (const [id, linkedOrg] of linkedOrgMap) {
  const baseOrg = baseDataMap.get(id);

  const resolve = (id: string) => {
    const target = linkedOrgMap.get(id);
    if (!target) {
      console.warn(
        `Warning: Organization [${id}] referenced by [${linkedOrg.id}] not found.`,
      );
    }
    return target;
  };

  linkedOrg.hasSubOrganization =
    baseOrg?.hasSubOrganization
      ?.map(resolve)
      .filter((org): org is LinkedOrganization => !!org) ?? [];

  linkedOrg.subOrganizationOf =
    baseOrg?.subOrganizationOf
      ?.map(resolve)
      .filter((org): org is LinkedOrganization => !!org) ?? [];

  linkedOrg.relatedTo =
    baseOrg?.relatedTo
      ?.map((rel) => {
        const target = resolve(rel.target);
        return target ? { type: rel.type, target } : null;
      })
      .filter((r): r is { type: string; target: LinkedOrganization } => !!r) ??
    [];
}

export const _organizationMap = baseDataMap;
export const _linkedOrganizationMap = linkedOrgMap;

const reverseRelations: Map<string, LinkedOrganization["relatedTo"][number][]> =
  new Map();

export const getReverseRelation = (
  orgId: string,
): LinkedOrganization["relatedTo"][number][] => {
  const relations = reverseRelations.get(orgId);
  if (relations) return relations;

  const newRelations: LinkedOrganization["relatedTo"][number][] = [];
  for (const [_otherId, otherOrg] of _linkedOrganizationMap) {
    for (const rel of otherOrg.relatedTo) {
      if (rel.target.id === orgId) {
        newRelations.push({ type: rel.type, target: otherOrg });
      }
    }
  }
  reverseRelations.set(orgId, newRelations);
  return newRelations;
};
