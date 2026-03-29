import { getCollection } from "astro:content";
import type { Person } from "generated/education";
import { compareStringWithRoman } from "@/utils/string";
import type { LinkedOrganization } from "./organizations";

const rawPeople = await getCollection("people");

const people: Person[] = rawPeople
  .flatMap((entry) => entry.data)
  .toSorted((a, b) => {
    const nameJa = a.name.ja ?? a.name.en ?? "";
    const nameEn = a.name.en ?? a.name.ja ?? "";
    const nameJaB = b.name.ja ?? b.name.en ?? "";
    const nameEnB = b.name.en ?? b.name.ja ?? "";

    return (
      compareStringWithRoman(nameJa, nameJaB) ||
      compareStringWithRoman(nameEn, nameEnB)
    );
  });
const _peopleMap = new Map(people.map((person) => [person.id, person]));

type LinkedPerson = Omit<Person, "memberOf"> & {
  memberOf: LinkedOrganization[];
};

const _linkedPeopleMap: Map<string, LinkedPerson> = new Map();

export { _linkedPeopleMap, _peopleMap, people, type LinkedPerson, type Person };
