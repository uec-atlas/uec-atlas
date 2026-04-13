import asyncio
from collections import defaultdict
from functools import cache
import json
import os
import re

from .. import utils
from ..gen_id import generate_id
from .lecture import Lecture
from .load_syllabuses import load_syllabuses
from .instructors_resolver import resolve_instructors


@cache
def segment_lecture_name(name: str) -> list[str]:
    name = utils.normalize_string(name)
    segments = [name.split("(")[0].strip()]
    matches = re.finditer(r"\((.+?)\)", name)
    for match in matches:
        segments.append(match.group())
    return [segment.strip("()").replace(" ", "").lower() for segment in segments]


syllabus_types = ["faculty_day", "faculty_night",
                  "graduate_master", "graduate_doctor"]

syllabus_urls = {
    "faculty_day": "https://kyoumu.office.uec.ac.jp/syllabus/{year}/GakkiIchiran_31_0.html",
    "faculty_night": "https://kyoumu.office.uec.ac.jp/syllabus/{year}/GakkiIchiran_32_0.html",
    "graduate_master": "https://kyoumu.office.uec.ac.jp/syllabus/{year}/GakkiIchiran_33_0.html",
    "graduate_doctor": "https://kyoumu.office.uec.ac.jp/syllabus/{year}/GakkiIchiran_34_0.html",
}

fallback_suffix = {
    "faculty_day": "z",
    "faculty_night": "s",
}

keyword_suffix_mapping = {
    "Iエリア": ["f", "g", "h"],
    "Mエリア": ["i", "j"]
}

graduate_syllabus_types = {"graduate_master", "graduate_doctor"}


def is_ab_numbering_code(code: str) -> bool:
    return len(code) >= 4 and code[3].lower() in {"a", "b"}


def dedupe_course_ids(course_ids: list[str]) -> list[str]:
    # 順序を保持したまま重複を除去する
    return list(dict.fromkeys(course_ids))


def search_course(courses: list[dict], title_segments: list[str]) -> list[dict] | None:
    # タイトルの部分を減らしながら検索して、前方一致するコースを探す
    if not title_segments:
        return []
    candidates = []
    for course in courses:
        course_title_segments = segment_lecture_name(course["name"]["ja"])
        if all(course_title_segments[i] == title_segments[i] for i in range(min(len(course_title_segments), len(title_segments)))):
            candidates.append(course)
    return candidates or search_course(courses, title_segments[:-1])


if __name__ == "__main__":
    import sys
    if len(sys.argv) != 3:
        print("Usage: python gen_lecture_collection.py <type> <year>")
        sys.exit(1)

    syllabus_type = sys.argv[1]
    year = int(sys.argv[2])

    if syllabus_type not in syllabus_types:
        print(
            f"Invalid syllabus type. Must be one of: {', '.join(syllabus_types)}")
        sys.exit(1)

    syllabus_url = syllabus_urls[syllabus_type].format(year=year)
    course_file = "data/education/courses.json"
    output_file = f"data/education/lectures/{year}/{syllabus_type}.json"
    syllabuses = asyncio.run(load_syllabuses(syllabus_url))
    lecture_collection = {
        "type": "LectureCollection",
        "entries": []
    }

    resolved_instructors = resolve_instructors(syllabuses)
    print(f"Total courses: {len(syllabuses)}")
    print(
        f"Total resolved instructors: {sum(len(instructors) for instructors in resolved_instructors.values())}")

    course_lookup: dict[str, dict] = {}  # 科目ID -> コースデータ
    code_course_id_mapping: dict[str, str] = {}  # 科目コード -> 科目ID
    course_id_code_mapping: dict[str, list[str]
                                 ] = defaultdict(list)  # 科目ID -> 科目コードリスト
    courses_without_code_for_year: list[dict] = []
    courses_with_ab_code_for_year: list[dict] = []
    all_courses: list[dict] = []

    with open(course_file, "r", encoding="utf-8") as f:
        course_data = json.load(f)
        all_courses = course_data["entries"]
        course_lookup = {c["id"]: c for c in all_courses}
        for course in all_courses:
            year_codes: list[str] = [
                code_mapping["code"]
                for code_mapping in course.get("codeMappings", [])
                if year in code_mapping.get("years", [])
            ]

            if not year_codes:
                courses_without_code_for_year.append(course)
            if any(is_ab_numbering_code(code) for code in year_codes):
                courses_with_ab_code_for_year.append(course)

            for code in year_codes:
                code_course_id_mapping[code] = course["id"]
                course_id_code_mapping[course["id"]].append(code)

    fallback_suffix_value = fallback_suffix.get(syllabus_type, "z")
    fallback_all_candidates_count = 0
    fallback_all_candidates_examples: list[str] = []

    for syllabus in syllabuses:
        lecture = Lecture(
            id=generate_id("uar:education/"),
            name=syllabus.name,
            name_en=syllabus.name_en,
            year=year,
            source_url=syllabus.url,
            courses=[],
            instructors=[
                person.id for person in resolved_instructors.get(syllabus, [])],
            credits=syllabus.credits,
            term=syllabus.term,
            periods=syllabus.periods.split(",") if syllabus.periods else [],
            timetable_code=syllabus.timetable_code
        )
        title_segments = segment_lecture_name(syllabus.name)

        if syllabus.numbering_codes:
            codes = [code.strip()
                     for code in syllabus.numbering_codes.split(" ")]
            if any(len(code) != 7 for code in codes):
                print(
                    f"Warning: Invalid numbering code format '{syllabus.numbering_codes}' for syllabus {syllabus.name}")
                continue

            has_ab_numbering_code = False
            for code in codes:
                has_ab_numbering_code = has_ab_numbering_code or is_ab_numbering_code(
                    code)
                course_id = code_course_id_mapping.get(code)
                if course_id:
                    lecture.courses.append(course_id)

            if has_ab_numbering_code:
                # 先行履修向けの科目は、同名の大学院科目（numbering codeなし）も併記する
                no_code_candidates = search_course(
                    courses_without_code_for_year, title_segments)
                lecture.courses.extend(
                    candidate["id"] for candidate in no_code_candidates)

        if syllabus_type in graduate_syllabus_types and not syllabus.numbering_codes:
            # 大学院シラバスは学務仕様としてnumbering codeを持たないため、no-code科目を優先して照合する
            no_code_candidates = search_course(
                courses_without_code_for_year, title_segments)
            ab_code_candidates = search_course(
                courses_with_ab_code_for_year, title_segments)
            lecture.courses.extend(
                candidate["id"] for candidate in no_code_candidates)
            lecture.courses.extend(
                candidate["id"] for candidate in ab_code_candidates)

        if not lecture.courses:
            candidates = search_course(
                all_courses, title_segments)

            if len(candidates) == 1:
                lecture.courses.append(candidates[0]["id"])
            elif len(candidates) > 1:
                suffix_candidates = [suffix for keyword,
                                     suffixes in keyword_suffix_mapping.items() if keyword in syllabus.name for suffix in suffixes]
                if suffix_candidates:
                    # キーワードに基づくSuffixで絞り込む
                    for candidate in candidates:
                        for suffix in suffix_candidates:
                            if any(code.endswith(suffix) for code in course_id_code_mapping[candidate["id"]]):
                                lecture.courses.append(candidate["id"])
                else:
                    # シラバス種別に基づくSuffixで絞り込む
                    type_base_candidates = [candidate for candidate in candidates if any(
                        code.endswith(fallback_suffix_value) for code in course_id_code_mapping[candidate["id"]])]
                    if type_base_candidates:
                        for candidate in type_base_candidates:
                            lecture.courses.append(candidate["id"])
                    else:
                        fallback_all_candidates_count += 1
                        if len(fallback_all_candidates_examples) < 10:
                            fallback_all_candidates_examples.append(
                                utils.normalize_string(syllabus.name))
                        # どちらの基準でも絞り込めない場合はすべての候補を追加
                        for candidate in candidates:
                            lecture.courses.append(candidate["id"])

        lecture.courses = dedupe_course_ids(lecture.courses)

        if not lecture.courses:
            print(
                f"Warning: No course found for syllabus '{utils.normalize_string(syllabus.name)}' with numbering codes '{syllabus.numbering_codes}'")

        lecture_collection["entries"].append(lecture.to_dict())

    os.makedirs(f"data/education/lectures/{year}", exist_ok=True)
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(lecture_collection, f, ensure_ascii=False, indent=2)

    print(
        f"Final fallback (all candidates added) count: {fallback_all_candidates_count}")
    if fallback_all_candidates_examples:
        print(
            f"Final fallback samples: {', '.join(fallback_all_candidates_examples)}")
