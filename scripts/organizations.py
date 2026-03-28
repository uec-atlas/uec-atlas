from dataclasses import dataclass
import json
from glob import glob
from functools import cache
import re


@dataclass
class Organization:
    file_basename: str
    type: str
    id: str
    name: str
    parents: list["Organization"] = None
    children: list["Organization"] = None

    def __post_init__(self):
        if self.parents is None:
            self.parents = []
        if self.children is None:
            self.children = []

    def __hash__(self):
        return hash(self.id)

    @property
    def depth(self) -> int:
        if not self.parents:
            return 0
        return 1 + max(parent.depth for parent in self.parents)


@cache
def load_organizations() -> dict[str, Organization]:
    organizations_raw: list[dict] = []
    organizations: dict[str, Organization] = {}
    for file in glob("data/organizations/**/*.json", recursive=True):
        with open(file, "r") as f:
            organization_raw = json.load(f)
            organization_raw["file_basename"] = file.split(
                "/")[-1].replace(".json", "")
            organizations_raw.append(organization_raw)
    for organization_raw in organizations_raw:
        organization = Organization(
            file_basename=organization_raw["file_basename"],
            type=organization_raw["type"],
            id=organization_raw["id"],
            name=organization_raw["name"]["ja"],
        )
        organizations[organization.id] = organization

    for organization_raw in organizations_raw:
        organization = organizations[organization_raw["id"]]
        for parent_id in organization_raw.get("subOrganizationOf", []):
            parent_org = organizations[parent_id]
            organization.parents.append(parent_org)
            parent_org.children.append(organization)

    return organizations


@cache
def find_organization_by_name_pattern(regex: str) -> Organization | None:
    organizations = load_organizations()
    for org in organizations.values():
        if re.search(regex, org.name):
            return org
    return None


def get_clusters():
    organizations = load_organizations()
    clusters = [org for org in organizations.values() if org.type == "Cluster"]
    return clusters


def get_programs():
    organizations = load_organizations()
    programs = [org for org in organizations.values() if org.type ==
                "EducationProgram"]
    return programs
