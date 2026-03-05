from dataclasses import dataclass
import json
from functools import cache


@dataclass
class CourseCategory:
    id: str
    name: str
    parent: "CourseCategory" = None
    children: list["CourseCategory"] = None

    def __post_init__(self):
        if self.children is None:
            self.children = []


@cache
def load_course_categories() -> dict[str, CourseCategory]:
    with open("data/education/course_categories.json", "r") as f:
        data = json.load(f)
        categories: dict[str, CourseCategory] = {}
        for entry in data["entries"]:
            category = CourseCategory(
                id=entry["id"],
                name=entry["name"]["ja"],
            )
            categories[category.id] = category
        for entry in data["entries"]:
            if "subCategoryOf" in entry:
                category = categories[entry["id"]]
                parent_id = entry["subCategoryOf"]
                parent_category = categories[parent_id]
                category.parent = parent_category
                parent_category.children.append(category)
        return categories


def find_course_category_by_fragments(fragments: list[str]) -> CourseCategory | None:
    categories = load_course_categories()
    for category in categories.values():
        cat_fragments = []
        cur = category
        while cur is not None:
            cat_fragments.append(cur.name)
            cur = cur.parent
        cat_fragments.reverse()

        for i in range(len(cat_fragments) - len(fragments) + 1):
            if cat_fragments[i:i+len(fragments)] == fragments:
                return category
    return None
