import json
import os
from pathlib import Path
import re

from numpy.char import isdigit
import pandas as pd

from scripts.gen_id import generate_id

from .course_registry import CourseRegistry
from .course_category import find_course_category_by_fragments, load_course_categories
from .extract_handbook import extract_handbook_tables
from ..organizations import find_organization_by_name_pattern, get_clusters, get_programs, load_organizations
from .utils import normalize_handbook_name


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

    def get_or_init_organization_entries(org) -> list:
        if org.id in output_files_per_organization:
            return output_files_per_organization[org.id][1]

        path = outdir / f"{org.file_basename}.json"
        if path.exists():
            try:
                with open(path, "r", encoding="utf-8") as f:
                    payload = json.load(f)
                entries = payload.get("entries", [])
            except Exception as e:
                print(
                    f"Warning: Failed to load existing curriculum file {path}: {e}")
        output_files_per_organization[org.id] = (org.file_basename, entries)
        return entries

    for table in course_list_tables:
        print(
            f"Table {table.attrs.get('title', 'unknown')} at {table.attrs.get('page', 'unknown')}")
        target_organizations = []
        if "総合文化科目" in table.attrs["title"] and "昼間コース" in table.attrs["title"]:
            target_organizations = clusters
        elif "プログラム" in table.attrs["title"]:
            program_name = table.attrs["title"][1:]
            target_organizations.append(
                find_organization_by_name_pattern(program_name))

        for _, row in table.iterrows():
            row_target_organizations = target_organizations

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
                curriculum_entries = get_or_init_organization_entries(org)

                entry = next((entry for entry in curriculum_entries if entry.get("type") == "CourseCategoryMapping" and entry.get(
                    "category") == category.id and entry.get("targetOrganization") == org.id), None)

                if entry is None:
                    entry = {
                        "id": generate_id("uar:education/"),
                        "name": {
                            "ja": f"{org.name} - {category_fragments_str}"
                        },
                        "type": "CourseCategoryMapping",
                        "targetOrganization": org.id,
                        "category": category.id,
                        "courses": []
                    }
                    curriculum_entries.append(entry)

                if course.id not in entry["courses"]:
                    entry["courses"].append(course.id)

    for table in tables:
        # 2年次終了時審査
        if all(col in table.columns for col in ["授業科目区分", "修得すべき単位", "審査対象科目"]):
            text = ""
            for _, row in table.iterrows():
                text += get_val(row, "審査対象科目")

            category_names = [
                category.name for category in load_course_categories().values() if category.name != "必修科目"]
            category_pattern = '|'.join(re.escape(name)
                                        for name in category_names)

            text = re.sub(
                fr"(\d+単位\([^)]*?類[^)]*?\))[ \t]*({category_pattern})", r"\2 \1", text)

            tokens = [m.group(0) for m in re.finditer(
                fr"{category_pattern}|\d+単位(?:\([^)]*?類[^)]*?\))?", text)]

            current_subj = None
            for token in tokens:
                if token in category_names:
                    current_subj = token  # 科目名なら記憶を上書き
                elif current_subj:
                    # 単位なら出力 (例: "18単位(Ⅰ類)" -> "18, Ⅰ類",  "4単位" -> "4" と文字を整える)
                    val = token.replace(
                        '単位(', ', ').replace('単位', '').replace(')', '')
                    credits = int(re.search(r"\d+", val).group(0))
                    category_fragments = [current_subj]
                    if current_subj == "理数基礎科目" or current_subj == "類共通基礎科目":
                        category_fragments.append("必修科目")
                    category = find_course_category_by_fragments(
                        category_fragments)

                    if category is None:
                        print(
                            f"Warning: No category found for fragments {category_fragments} in 2nd year checkpoint ({current_subj})")
                        continue
                    target_organizations = []
                    if "Ⅰ類" in val:
                        target_organizations.append(
                            find_organization_by_name_pattern("Ⅰ類"))
                    if "Ⅱ類" in val:
                        target_organizations.append(
                            find_organization_by_name_pattern("Ⅱ類"))
                    if "Ⅲ類" in val:
                        target_organizations.append(
                            find_organization_by_name_pattern("Ⅲ類"))
                    if not target_organizations:
                        target_organizations = clusters
                    for org in target_organizations:
                        curriculum_entries = get_or_init_organization_entries(
                            org)

                        entry = next((entry for entry in curriculum_entries if entry.get(
                            "type") == "Checkpoint" and entry.get("targetOrganization") == org.id
                            and entry["name"]["ja"] == "2年次終了時審査"), None)

                        if entry is None:
                            entry = {
                                "id": generate_id("uar:education/"),
                                "name": {
                                    "ja": f"2年次終了時審査"
                                },
                                "type": "Checkpoint",
                                "targetOrganization": org.id,
                                "categoryRequirements": []
                            }
                            curriculum_entries.append(entry)

                        if any(
                                req["minCredits"] == credits
                                and set(req.get("targetCategories", [])) == set(c.id for c in [category])
                                for req in entry["categoryRequirements"]):
                            continue

                        new_entry = {
                            "minCredits": credits,
                            "targetCategories": [category.id]
                        }

                        entry["categoryRequirements"].append(new_entry)

            # 卒業研究着手審査(昼間)
        if all(col in table.columns for col in ["授業科目区分", "修得すべき単位", "審査対象科目・要件等"]):
            for _, row in table.iterrows():
                credits = get_val(row, "修得すべき単位")
                credits = int(credits) if isdigit(credits) else 0
                notes = get_val(row, "審査対象科目・要件等")

                category_fragments = get_val(
                    row, "授業科目区分", multivalued=True)
                category_fragments = [
                    normalize_handbook_name(f) for f in category_fragments]
                category_fragments_str = "/".join(category_fragments)
                category_fragments = [f.split("(")[0].strip()
                                      for f in category_fragments]
                if "・" in category_fragments[-1] and "健康・スポーツ科学科目" not in category_fragments[-1]:
                    category_fragments = category_fragments[-1].split("・")
                else:
                    category_fragments = [category_fragments[-1]]

                categories = []
                for f in category_fragments:
                    frags_list = []
                    if f in ["理数基礎科目", "類共通基礎科目", "類専門科目", "専門科目"]:
                        has_sub = False
                        notes_clean = notes.replace("選択必修", "@@@")
                        if "必修" in notes_clean:
                            frags_list.append([f, "必修科目"])
                            has_sub = True
                        if "@@@" in notes_clean:
                            frags_list.append([f, "選択必修科目"])
                            has_sub = True
                        if "選択" in notes_clean:
                            frags_list.append([f, "選択科目"])
                            has_sub = True
                        if not has_sub:
                            frags_list.append([f])
                    else:
                        frags_list.append([f])

                    for frags in frags_list:
                        cat = find_course_category_by_fragments(frags)
                        if cat:
                            categories.append(cat)

                if not categories:
                    if "必要総単位数" in category_fragments_str:
                        credits = int(re.search(r"(\d+)単位以上を修得",
                                      category_fragments_str).group(1))
                    else:
                        print(
                            f"Warning: No category found for fragments {category_fragments_str} in graduation requirements ({get_val(row, '授業科目区分')})")
                        continue

                target_organizations = []
                if "総合文化科目" in category_fragments_str or "実践教育科目" in category_fragments_str:
                    target_organizations = clusters
                elif "プログラム" in category_fragments_str:
                    program_name = re.search(
                        r"([^\/]+プログラム)", category_fragments_str).group(1)
                    target_organizations = [
                        find_organization_by_name_pattern(program_name)]
                elif "Ⅰ類" in category_fragments_str or "Ⅱ類" in category_fragments_str or "Ⅲ類" in category_fragments_str:
                    cluster_names = [m.group(0) for m in re.finditer(
                        r"(Ⅰ類|Ⅱ類|Ⅲ類)", category_fragments_str)]

                    target_organizations = [
                        find_organization_by_name_pattern(cluster_name) for cluster_name in cluster_names]

                for org in target_organizations:
                    curriculum_entries = get_or_init_organization_entries(
                        org)

                    entry = next((entry for entry in curriculum_entries if entry.get(
                        "type") == "Checkpoint" and entry.get("targetOrganization") == org.id
                        and entry["name"]["ja"] == "卒業研究着手審査"), None)

                    if entry is None:
                        entry = {
                            "id": generate_id("uar:education/"),
                            "name": {
                                "ja": f"卒業研究着手審査"
                            },
                            "type": "Checkpoint",
                            "targetOrganization": org.id,
                            "categoryRequirements": []
                        }
                        curriculum_entries.append(entry)

                    if any(
                        req["minCredits"] == credits
                            and req["description"] == notes
                            and set(req.get("targetCategories", [])) == set(c.id for c in categories)
                            for req in entry["categoryRequirements"]):
                        continue

                    new_entry = {
                        "minCredits": credits,
                        "description": notes
                    }

                    if categories:
                        new_entry["targetCategories"] = [
                            c.id for c in categories]

                    entry["categoryRequirements"].append(new_entry)

        # 卒業所要単位(昼間)
        if "類区分プログラム" in table.columns and len(table.columns) == 18:
            program_names = [
                f"{name.split(')')[-1]}プログラム" for name in table.columns[3:]]
            for _, row in table.iterrows():
                category_fragments = get_val(row, "類区分プログラム", multivalued=True)
                category_fragments = list(dict.fromkeys(
                    [normalize_handbook_name(f) for f in category_fragments]))
                category_fragments_str = "/".join(category_fragments)
                if "小計" in category_fragments or "合計" in category_fragments:
                    continue
                category_fragments = [
                    f"{f}科目" if any(f == flag for flag in ["必修", "選択必修", "選択"]) else f for f in category_fragments
                ]
                if "総合文化科目" in category_fragments_str:
                    category_fragments = category_fragments[-1:]
                category = find_course_category_by_fragments(
                    category_fragments)
                if category is None:
                    print(
                        f"Warning: No category found for fragments {category_fragments} in course list ({get_val(row, '類区分プログラム')})")
                    continue

                credits = row.iloc[3:]

                for program_name, credit in zip(program_names, credits):
                    if credit and credit != "nan":
                        org = find_organization_by_name_pattern(program_name)
                        if org is None:
                            print(
                                f"Warning: No organization found for program name {program_name} in course list ({get_val(row, '類区分プログラム')})")
                            continue

                        curriculum_entries = get_or_init_organization_entries(
                            org)

                        entry = next((entry for entry in curriculum_entries if entry.get(
                            "type") == "Checkpoint" and entry.get("targetOrganization") == org.id
                            and entry["name"]["ja"] == "卒業所要単位"), None)

                        if entry is None:
                            entry = {
                                "id": generate_id("uar:education/"),
                                "name": {
                                    "ja": f"卒業所要単位"
                                },
                                "type": "Checkpoint",
                                "targetOrganization": org.id,
                                "categoryRequirements": []
                            }
                            curriculum_entries.append(entry)

                        if credit == "-":
                            continue
                        credit = int(credit)

                        if any(
                                req["minCredits"] == credit
                            and set(req.get("targetCategories", [])) == set(c.id for c in [category])
                                for req in entry["categoryRequirements"]):
                            continue

                        new_entry = {
                            "minCredits": credit,
                            "targetCategories": [category.id]
                        }

                        entry["categoryRequirements"].append(new_entry)

    for (output_file, curriculum_entries) in output_files_per_organization.values():
        with open(outdir / f"{output_file}.json", "w", encoding="utf-8") as f:
            json.dump({
                "type": "Curriculum",
                "year": year,
                "entries": curriculum_entries
            }, f, ensure_ascii=False, indent=2)
