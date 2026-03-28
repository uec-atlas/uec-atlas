from dataclasses import dataclass

from ..organizations import find_organization_by_name_pattern, Organization
from . import utils


@dataclass
class Person:
    id: str
    name: str
    name_en: str = None
    alternative_names: list[str] = None
    alternative_names_en: list[str] = None
    member_of: list[str] = None
    is_based_on: str = None
    is_part_time: bool = False

    def resolve_member_of(self) -> list["Organization"]:
        resolved = []
        for org_name in self.member_of or []:
            org = find_organization_by_name_pattern(
                org_name.split("(")[0].split(" ")[-1].strip())
            if org:
                resolved.append(org)
        return list({org.id: org for org in resolved}.values())

    @property
    def canonical_key(self) -> utils.CanonicalKey:
        return utils.CanonicalKey(self.name)

    def to_dict(self) -> dict:
        name = {"ja": utils.normalize_name(self.name)}
        if self.name_en:
            name["en"] = utils.normalize_name(self.name_en)
        alternate_names = {}
        if self.alternative_names:
            alternate_names["ja"] = [utils.normalize_name(
                n) for n in self.alternative_names]
        if self.alternative_names_en:
            alternate_names["en"] = [utils.normalize_name(
                n) for n in self.alternative_names_en]

        return {
            "id": self.id,
            "name": name,
            "alternateNames": alternate_names,
            "memberOf": [org.id for org in self.resolve_member_of()],
            "isBasedOn": self.is_based_on,
            "isPartTime": self.is_part_time,
        }

    def __hash__(self):
        return hash(self.canonical_key)
