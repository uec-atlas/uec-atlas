import asyncio
from collections import defaultdict
from functools import cache
import json
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
    with open(course_file, "r", encoding="utf-8") as f:
        course_data = json.load(f)
        course_lookup = {c["id"]: c for c in course_data["entries"]}
        for course in course_data["entries"]:
            for code_mapping in course.get("codeMappings", []):
                if year in code_mapping["years"]:
                    code_course_id_mapping[code_mapping["code"]] = course["id"]
                    course_id_code_mapping[course["id"]].append(
                        code_mapping["code"])

    fallback_suffix = fallback_suffix.get(syllabus_type, "z")

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
            periods=syllabus.periods.split(",") if syllabus.periods else []
        )

        if syllabus.numbering_codes:
            codes = [code.strip()
                     for code in syllabus.numbering_codes.split(" ")]
            if any(len(code) != 7 for code in codes):
                print(
                    f"Warning: Invalid numbering code format '{syllabus.numbering_codes}' for syllabus {syllabus.name}")
                continue
            for code in codes:
                lecture.courses.append(code_course_id_mapping.get(code))
        else:
            candidates = search_course(
                list(course_lookup.values()), segment_lecture_name(syllabus.name))

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
                        code.endswith(fallback_suffix) for code in course_id_code_mapping[candidate["id"]])]
                    if type_base_candidates:
                        for candidate in type_base_candidates:
                            lecture.courses.append(candidate["id"])
                    else:
                        # どちらの基準でも絞り込めない場合はすべての候補を追加
                        for candidate in candidates:
                            lecture.courses.append(candidate["id"])

        if not lecture.courses:
            print(
                f"Warning: No course found for syllabus '{utils.normalize_string(syllabus.name)}' with numbering codes '{syllabus.numbering_codes}'")

        lecture_collection["entries"].append(lecture.to_dict())

    with open(output_file, "w", encoding="utf-8") as f:
        json.dump(lecture_collection, f, ensure_ascii=False, indent=2)
