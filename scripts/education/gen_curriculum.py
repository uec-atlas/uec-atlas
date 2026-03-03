import json
import os
from pathlib import Path

import pandas as pd

from scripts.gen_id import generate_id

from .course_registry import CourseRegistry
from .course_category import find_course_category_by_fragments, load_course_categories
from .extract_handbook import extract_handbook_tables
from .organizations import find_organization_by_name_pattern, get_clusters, get_programs, load_organizations
from .utils import normalize_handbook_name


def generate_curriculum(year: int, input_path: str):
    tables = extract_handbook_tables(year, input_path)
    course_registry = CourseRegistry("data/education/courses.json")

    clusters = get_clusters()
    night_program = find_organization_by_name_pattern("先端工学基礎課程")

    course_list_tables = [
        table for table in tables
        if all(col in table.columns for col in ["授業科目", "科目番号", "単位数"])
    ]

    output_files_per_organization: dict[str, tuple[str, list]] = {}
    outdir = Path(f"data/education/curriculums/{year}")
    outdir.mkdir(parents=True, exist_ok=True)
    existing_ids_per_output_file: dict[str, dict[str, str]] = {}

    def get_existing_entry_ids(output_file: str) -> dict[str, str]:
        if output_file in existing_ids_per_output_file:
            return existing_ids_per_output_file[output_file]

        path = outdir / f"{output_file}.json"
        ids_by_category: dict[str, str] = {}
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    payload = json.load(f)
                for entry in payload.get("entries", []):
                    category_id = entry.get("category")
                    entry_id = entry.get("id")
                    if category_id and entry_id:
                        ids_by_category[str(category_id)] = str(entry_id)
            except Exception as e:
                print(
                    f"Warning: Failed to load existing curriculum file {path}: {e}")

        existing_ids_per_output_file[output_file] = ids_by_category
        return ids_by_category

    for table in course_list_tables:
        print(
            f"Table {table.attrs['title']} at {table.attrs.get('page', 'unknown')}")
        target_organizations = []
        if "総合文化科目" in table.attrs["title"] and "昼間コース" in table.attrs["title"]:
            target_organizations = clusters
        elif "プログラム" in table.attrs["title"]:
            program_name = table.attrs["title"][1:]
            target_organizations.append(
                find_organization_by_name_pattern(program_name))

        for _, row in table.iterrows():
            row_target_organizations = target_organizations

            def get_val(row, col, multivalued=False):
                val = row[col]
                if isinstance(val, pd.Series):
                    if multivalued:
                        return [str(v).strip() for v in val if not pd.isna(v)]
                    else:
                        return str(val.iloc[0]).strip()
                result = str(val).strip()
                if multivalued:
                    return [result] if result and result != "nan" else []
                return result

            code = get_val(row, "科目番号")
            course = course_registry.find_course_by_code(year, code)

            if course is None:
                print(
                    f"Warning: No course found for code {code} in year {year} ({get_val(row, '授業科目')})")
                continue

            if not row_target_organizations:
                if code.endswith("z"):
                    row_target_organizations = clusters
                elif code.endswith("s") or code.endswith("t"):
                    row_target_organizations = [night_program]
                else:
                    print(
                        f"Warning: No target organization found for course {code} in year {year} ({get_val(row, '授業科目')})")
                    continue

            category_fragments = []

            if "科目区分" in table.columns:
                category_fragments = get_val(row, "科目区分", multivalued=True)
            elif "区分" in table.columns:
                category_fragments = get_val(row, "区分", multivalued=True)
            category_fragments = [
                normalize_handbook_name(f) for f in category_fragments if "プログラム" not in f]

            category_fragments = list(dict.fromkeys(category_fragments))
            category_fragments_str = "/".join(category_fragments)
            if category_fragments[0] == "総合文化科目":
                category_fragments = category_fragments[-1:]
                if "類" in category_fragments[0]:
                    category_fragments[0] = category_fragments[0].replace(
                        "類", "類 ")

            category = find_course_category_by_fragments(
                category_fragments)

            if category is None:
                print(
                    f"Warning: No category found for fragments {category_fragments} in course {code} ({get_val(row, '授業科目')})")
                continue

            for org in row_target_organizations:
                if org.id not in output_files_per_organization:
                    output_files_per_organization[
                        org.id] = (org.file_basename, [])

                output_file, curriculum_entries = output_files_per_organization[org.id]
                existing_ids = get_existing_entry_ids(output_file)

                entry = next((entry for entry in curriculum_entries if entry.get(
                    "category") == category.id), None)

                if entry is None:
                    entry = {
                        "id": existing_ids.get(category.id, generate_id("uar:education/")),
                        "name": {
                            "ja": f"{org.name} - {category_fragments_str}"
                        },
                        "type": "CourseCategoryMapping",
                        "targetOrganization": org.id,
                        "category": category.id,
                        "courses": []
                    }
                    curriculum_entries.append(entry)
                entry["courses"].append(course.id)

    for (output_file, curriculum_entries) in output_files_per_organization.values():
        with open(outdir / f"{output_file}.json", "w", encoding="utf-8") as f:
            json.dump({
                "type": "Curriculum",
                "year": year,
                "entries": curriculum_entries
            }, f, ensure_ascii=False, indent=2)
