import { getCollection } from "astro:content";
import type { Person } from "generated/education";
import {
  _linkedOrganizationMap,
  type LinkedOrganization,
} from "./organizations";

const rawPeople = await getCollection("people");

const people: Person[] = rawPeople.flatMap((entry) => entry.data);
const _peopleMap = new Map(people.map((person) => [person.id, person]));

type LinkedPerson = Omit<Person, "memberOf"> & {
  memberOf: LinkedOrganization[];
};

const _linkedPeopleMap: Map<string, LinkedPerson> = new Map();

for (const person of people) {
  const linkedMemberOf: LinkedOrganization[] = [];
  for (const orgId of person.memberOf ?? []) {
    const linkedOrg = _linkedOrganizationMap.get(orgId);
    if (linkedOrg) linkedMemberOf.push(linkedOrg);
  }
  _linkedPeopleMap.set(person.id, {
    ...person,
    memberOf: linkedMemberOf,
  });
}

export { people, _peopleMap, _linkedPeopleMap, type LinkedPerson };
