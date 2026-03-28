from dataclasses import dataclass
import re

from .load_syllabuses import SyllabusCourse
import json
from glob import glob
from functools import cache
from . import utils
from ..organizations import Organization, find_organization_by_name_pattern, load_organizations
from ..people.people import Person
from ..people import utils as people_utils
from ..gen_id import generate_id
from collections import defaultdict

PART_TIME_PREFIX = ("◯", "〇", "○")
TECH_STAFF_PREFIX = ("*", "＊")


@cache
def load_instructor_candidates() -> list[Person]:
    people: list[Person] = []
    for file in glob("data/people/**/*.json", recursive=True):
        with open(file, "r") as f:
            people_raw = json.load(f)
            for person_raw in people_raw:
                person = Person(
                    id=person_raw["id"],
                    name=person_raw["name"]["ja"],
                    name_en=person_raw["name"].get("en"),
                    member_of=person_raw.get("memberOf", []),
                    is_part_time=person_raw.get("isPartTime", False)
                )
                people.append(person)

    return people


def load_instructor_organizations():
    instructor_org_map = defaultdict[Person, set[Organization]](set)
    organizations = load_organizations()
    for person in load_instructor_candidates():
        for org in person.member_of:
            org_obj = organizations.get(org)
            if org_obj:
                instructor_org_map[person].add(org_obj)
                if org_obj.type == "EducationProgram":
                    for parent in org_obj.parents:
                        instructor_org_map[person].add(parent)

    return instructor_org_map


tech_staff_org = find_organization_by_name_pattern("教育研究技師部")


def load_instructor_overrides() -> dict[str, dict[str, Person]]:
    overrides = defaultdict[str, dict[str, Person]](dict)
    instructors = load_instructor_candidates()
    instructor_map = {person.id: person for person in instructors}
    with open("data/education/lecture_instructor_overrides.json", "r") as f:
        data = json.load(f)
        for entry in data:
            person = instructor_map.get(entry["override"])
            if person:
                overrides[entry["title"]][entry["name"]] = person
            else:
                print(
                    f"Warning: Override entry for '{entry['name']}' in course '{entry['title']}' references unknown person id '{entry['override']}'")
    return overrides


@dataclass
class InstructorName:
    original: str
    normalized: str = None
    canonical_key: people_utils.CanonicalKey = None
    segments: list[str] = None

    def __post_init__(self):
        self.normalized = re.sub(
            r"\(.{2,}\)", "", utils.normalize_instructor_name(self.original))
        self.segments = re.sub(r"\(.+?\)?", "", self.normalized).split(" ")
        given_name_fragment_match = re.search(
            r"\((.{1})\)?", self.normalized)
        if given_name_fragment_match:
            self.segments.append(given_name_fragment_match.group(1))
        self.segments = [people_utils.canonicalize_kanji(
            segment) for segment in self.segments]
        self.canonical_key = people_utils.CanonicalKey(self.segments)

    def __hash__(self):
        return hash(self.canonical_key)

    def __eq__(self, other):
        if not isinstance(other, InstructorName):
            return False
        return self.canonical_key == other.canonical_key


@cache
def split_instructor_name(name: str) -> list[InstructorName]:
    return [InstructorName(n.strip()) for n in re.split(r"[・、]", name) if n.strip()]


@cache
def instructor_name_starts_with(instructor_name: InstructorName, candidate_name: InstructorName) -> bool:
    i_segs = instructor_name.segments
    c_segs = candidate_name.segments

    if candidate_name.normalized.replace(" ", "").startswith(instructor_name.normalized.replace(" ", "")):
        return True

    try:
        return all(c_segs[i].startswith(i_segs[i]) for i in range(len(i_segs)))
    except IndexError:
        return False


def is_fullname(instructor_name: InstructorName) -> bool:
    return len(instructor_name.normalized.split(" ")) >= 2


def resolve_instructors(syllabuses: list[SyllabusCourse]) -> dict[SyllabusCourse, list[Person]]:
    candidates_organizations = load_instructor_organizations()
    candidates_regular = {InstructorName(
        person.name): person for person in load_instructor_candidates() if not person.is_part_time}
    candidates_regular_en = {InstructorName(
        person.name_en): person for person in load_instructor_candidates() if person.name_en}
    candidates_tech_staff = {name: person for name, person in candidates_regular.items(
    ) if tech_staff_org in candidates_organizations[person]}
    candidates_part_time = {InstructorName(
        person.name): person for person in load_instructor_candidates() if person.is_part_time}
    candidates_full = {**candidates_regular, **
                       candidates_regular_en, **candidates_part_time}

    instructor_overrides = load_instructor_overrides()

    unresolved_courses = {
        course.timetable_code: course for course in syllabuses}
    course_instructor_names = {
        course.timetable_code: split_instructor_name(course.instructors) for course in syllabuses}
    resolved_instructors = defaultdict[str, dict[InstructorName, Person]](dict)

    for course in list(unresolved_courses.values()):
        if course.instructors.strip() == "未定":
            resolved_instructors[course.timetable_code] = {}
            del unresolved_courses[course.timetable_code]
            continue
        for instructor_name in course_instructor_names[course.timetable_code]:
            if is_fullname(instructor_name):
                # (1) 完全一致で検索
                result = candidates_full.get(instructor_name)
                if result:
                    resolved_instructors[course.timetable_code][instructor_name] = result
                    continue
                # (2) 完全一致しないけどフルネームっぽい場合は、そのまま仮の担当教員として登録
                resolved_instructors[course.timetable_code][instructor_name] = Person(
                    id=None,
                    name=instructor_name.normalized,
                    member_of=[]
                )
                continue

            # (3) 名前の前に「*」がついている場合は、教育研究技師部のリストから前方一致で検索
            if instructor_name.original.startswith(TECH_STAFF_PREFIX):
                result = next(
                    (person for name, person in candidates_tech_staff.items()
                     if instructor_name_starts_with(instructor_name, name)),
                    None
                )
                if result:
                    resolved_instructors[course.timetable_code][instructor_name] = result
                    continue

            # (4) もし上書き指定があれば、それを優先して採用
            for pattern, instructors in instructor_overrides.items():
                if re.search(pattern, course.name):
                    override = instructors.get(instructor_name.normalized)
                    if override:
                        resolved_instructors[course.timetable_code][instructor_name] = override
                        continue

        if len(resolved_instructors[course.timetable_code]) == len(course_instructor_names[course.timetable_code]):
            del unresolved_courses[course.timetable_code]

    changed = True
    limit = 10
    count = 0
    while changed and count < limit:
        count += 1
        changed = False

        for course in list(unresolved_courses.values()):
            for instructor_name in course_instructor_names[course.timetable_code]:
                if instructor_name in resolved_instructors[course.timetable_code]:
                    continue
                is_part_time = instructor_name.original.startswith(
                    PART_TIME_PREFIX)

                if is_part_time:
                    # (5) 非常勤講師は、非常勤講師のリストから前方一致で検索
                    instructor_candidates = [person for name, person in candidates_part_time.items(
                    ) if instructor_name_starts_with(instructor_name, name)]
                    if len(instructor_candidates) == 1:
                        resolved_instructors[course.timetable_code][instructor_name] = instructor_candidates[0]
                        changed = True
                        continue
                    else:
                        same_name = (instructor_name.canonical_key ==
                                     candidate.canonical_key for candidate in instructor_candidates)
                        if any(same_name):
                            print(
                                f"WARN: Multiple candidates with the same canonical key for part-time instructor '{instructor_name.original}' in course '{course.name}'")
                            resolved_instructors[course.timetable_code][instructor_name] = next(
                                candidate for candidate in instructor_candidates if candidate.canonical_key == instructor_name.canonical_key)
                            changed = True
                            continue
                        print(
                            f"WARN: Could not uniquely resolve part-time instructor '{instructor_name.original}' in course '{course.name}'")
                else:
                    # (6) それ以外は、全体のリストから前方一致で検索
                    instructor_candidates = [
                        person for name, person in candidates_full.items() if instructor_name_starts_with(instructor_name, name)]

                    if len(instructor_candidates) == 1:
                        # (6-1) 前方一致する教職員が1人だけいる場合は、その人を採用
                        resolved_instructors[course.timetable_code][instructor_name] = instructor_candidates[0]
                        changed = True
                        continue
                    elif len(instructor_candidates) > 1:
                        # (6-2) 前方一致する教職員が複数いる場合は、同じ授業を担当する他の教員との所属の重なりが最も多い人を採用
                        colleagues = [
                            candidate for candidate in resolved_instructors[course.timetable_code].values()]
                        max_score = 0
                        best_candidates = []
                        for candidate in instructor_candidates:
                            candidate_orgs = candidates_organizations[candidate]
                            colleague_orgs = [
                                candidates_organizations[colleague] for colleague in colleagues]

                            # 組織の深さも考慮して、単純な重なり数ではなく、重なりの深さの合計でスコア付け
                            total_score = sum(
                                org.depth for colleague_org in colleague_orgs for org in candidate_orgs.intersection(colleague_org))

                            # 名前の完全一致セグメント数もスコアに加算
                            total_score += len(instructor_name.canonical_key.value &
                                               candidate.canonical_key.value)

                            # 非常勤/常勤の一致もスコアに加算
                            total_score += 1 if candidate.is_part_time == is_part_time else 0

                            if total_score > max_score:
                                max_score = total_score
                                best_candidates = [candidate]
                            elif total_score == max_score:
                                best_candidates.append(candidate)
                        if len(best_candidates) == 1:
                            resolved_instructors[course.timetable_code][instructor_name] = best_candidates[0]
                            changed = True
                            continue
                        if len(best_candidates) > 1 and count > 1:
                            print(
                                f"WARN: Tie in {course.name} for {instructor_name.original}")

            if len(resolved_instructors[course.timetable_code]) == len(course_instructor_names[course.timetable_code]):
                del unresolved_courses[course.timetable_code]

    print(f"Total courses: {len(syllabuses)}")
    print(f"Unresolved courses: {len(unresolved_courses)}")
    print(
        f"Resolved instructors: {sum(len(instructors) for instructors in resolved_instructors.values())}")

    course_lookup = {c.timetable_code: c.name for c in syllabuses}

    unresolved_map: dict[str, Person] = {}
    unresolved_to_subjects: defaultdict[str, set[str]] = defaultdict(set)

    for timetable_code, expected_names in course_instructor_names.items():
        resolved_dict = resolved_instructors.get(timetable_code, {})
        course_name = course_lookup.get(timetable_code, timetable_code)

        for inst_name in expected_names:
            person = resolved_dict.get(inst_name)

            if person is None or person.id is None:
                name_ja = inst_name.normalized
                if name_ja == "未定":
                    continue
                unresolved_to_subjects[name_ja].add(course_name)

                if name_ja not in unresolved_map:
                    new_person = Person(
                        id=generate_id("uar:people/"),
                        name=name_ja,
                        member_of=[],
                        is_part_time=inst_name.original.startswith(
                            PART_TIME_PREFIX)
                    )
                    unresolved_map[name_ja] = new_person
                if person and person.id is None:
                    person.id = unresolved_map[name_ja].id

    if unresolved_map:
        print(f"Unresolved instructors: {len(unresolved_map)}")
        print("Hint: Check the generated data/education/unresolved_instructors.json and add them to data/people, then re-run the resolver.")

        for name in sorted(unresolved_map.keys()):
            person = unresolved_map[name]
            subjects = ", ".join(sorted(list(unresolved_to_subjects[name])))
            print(f"- {name} (assigned id: {person.id})")
            print(f"    Subjects: [{subjects}]")

        save_unresolved_instructors(
            unresolved_map, "data/education/unresolved_instructors.json")

        exit(1)

    return {next(course for course in syllabuses if course.timetable_code == timetable_code): list(instructors.values())
            for timetable_code, instructors in resolved_instructors.items()}


def save_unresolved_instructors(unresolved_instructors: dict[str, Person], output_file: str):
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump([instructor.to_dict() for instructor in unresolved_instructors.values()],
                  f, ensure_ascii=False, indent=2)
