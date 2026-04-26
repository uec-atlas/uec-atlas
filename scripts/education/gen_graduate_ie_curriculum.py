import argparse
from difflib import SequenceMatcher
from functools import cache
from glob import glob
import json
import pickle
import re
from pathlib import Path

import pandas as pd

from scripts.education.course_category import load_course_categories
from scripts.education.extract_handbook import extract_handbook_tables
from scripts.education.utils import normalize_handbook_name
from scripts.gen_id import generate_id
from scripts.organizations import Organization, load_organizations

MARK_RE = re.compile(r"[○〇◎AB]")


def normalize_for_matching(text: str) -> str:
    normalized = normalize_handbook_name(text or "")
    return re.sub(r"[\s\u3000()（）/／・･\-]", "", normalized)


def build_category_maps() -> tuple[dict[str, str], dict[str, str]]:
    categories = load_course_categories()
    name_to_id = {
        category.name: category.id for category in categories.values()}
    id_to_name = {
        category.id: category.name for category in categories.values()}
    return name_to_id, id_to_name


def build_parse_candidate_names(category_names: list[str]) -> tuple[str, ...]:
    relevant = [
        name
        for name in category_names
        if name.startswith("大学院") or name.startswith("専門")
    ]
    # Use longest-first to prioritize specific names like 専門科目Ⅱ(A) over 専門科目Ⅱ.
    return tuple(sorted(relevant, key=len, reverse=True))


@cache
def get_parse_candidate_names() -> tuple[str, ...]:
    return build_parse_candidate_names(list(CATEGORY_IDS.keys()))


def get_category_id(name: str) -> str:
    category = CATEGORY_IDS.get(name)
    if category is None:
        raise RuntimeError(
            f"Category '{name}' is missing in data/education/course_categories.json"
        )
    return category


def resolve_category_name(s: str) -> str | None:
    if s in CATEGORY_IDS:
        return s

    if s == "*":
        return "専門科目Ⅱ"

    for category_name in get_parse_candidate_names():
        if category_name in s:
            return category_name

    return None


def collect_grad_organization_sets() -> tuple[
    dict[str, Organization],
    dict[str, Organization],
    set[str],
    set[str],
    set[str],
]:
    organizations = load_organizations()

    legacy_master_orgs = {
        org_id: org
        for org_id, org in organizations.items()
        if org.type in {"EducationProgram", "EducationCourse"}
        and "専攻" in org.name
        and "博士前期課程" in org.name
    }

    doctor_orgs = {
        org_id: org
        for org_id, org in organizations.items()
        if org.type in {"EducationProgram", "EducationCourse"}
        and "専攻" in org.name
        and "博士後期課程" in org.name
    }

    master_program_orgs = {
        org_id: org
        for org_id, org in organizations.items()
        if org.type == "EducationProgram"
        and "プログラム" in org.name
        and any(parent.id in legacy_master_orgs for parent in org.parents)
    }

    master_program_org_ids = set(master_program_orgs.keys())
    doctor_org_ids = set(doctor_orgs.keys())
    legacy_master_org_ids = set(legacy_master_orgs.keys())
    target_grad_org_ids = master_program_org_ids | doctor_org_ids
    reset_org_scope = target_grad_org_ids | legacy_master_org_ids

    return (
        master_program_orgs,
        doctor_orgs,
        legacy_master_org_ids,
        target_grad_org_ids,
        reset_org_scope,
    )


CATEGORY_IDS, CATEGORY_NAMES = build_category_maps()

(
    MASTER_PROGRAM_ORGS,
    DOCTOR_ORGS,
    LEGACY_MASTER_ORG_IDS,
    TARGET_GRAD_ORGS,
    RESET_ORG_SCOPE,
) = collect_grad_organization_sets()


def normalize_mark(value: object) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).strip().replace(" ", "")


def is_marked(value: object) -> bool:
    return bool(MARK_RE.search(normalize_mark(value)))


def parse_int_credits(value: object) -> int | None:
    s = normalize_mark(value)
    if not s:
        return None
    m = re.search(r"\d+", s)
    if not m:
        return None
    return int(m.group(0))


def get_cell_text(row: pd.Series, column: str, prefer_last: bool = True) -> str:
    if column not in row.index:
        return ""

    value = row[column]
    if isinstance(value, pd.Series):
        vals = [normalize_mark(v) for v in value.tolist()]
        vals = [v for v in vals if v and v.lower() != "nan"]
        if not vals:
            return ""
        return vals[-1] if prefer_last else vals[0]

    s = normalize_mark(value)
    return "" if s.lower() == "nan" else s


def get_cell_int(row: pd.Series, column: str) -> int | None:
    if column not in row.index:
        return None

    value = row[column]
    if isinstance(value, pd.Series):
        for v in value.tolist():
            parsed = parse_int_credits(v)
            if parsed is not None:
                return parsed
        return None
    return parse_int_credits(value)


def get_cell_text_by_index(row: pd.Series, column_index: int) -> str:
    """重複列名の影響を受けないよう、位置指定でセル値を取得する。"""
    if column_index < 0 or column_index >= len(row):
        return ""

    value = row.iloc[column_index]
    s = normalize_mark(value)
    return "" if s.lower() == "nan" else s


def parse_category(raw: str, course_name: str = "", fallback: str | None = None) -> str | None:
    s = normalize_handbook_name(raw or "")
    if not s:
        return fallback

    resolved_category_name = resolve_category_name(s)
    if resolved_category_name is not None:
        return get_category_id(resolved_category_name)

    # Heuristic for rows where merged cells collapsed into subject names.
    if any(k in s for k in ["特論", "ラボワーク", "セミナー", "実習"]):
        if "専門上級" in course_name:
            return get_category_id("専門上級科目")
        return get_category_id("専門科目Ⅱ")

    return fallback


def first_column(cols: list[str], keyword: str) -> str | None:
    for c in cols:
        if keyword in c:
            return c
    return None


def has_column_keyword(table: pd.DataFrame, keyword: str) -> bool:
    return any(keyword in str(col) for col in table.columns)


def get_program_columns(table: pd.DataFrame) -> list[tuple[int, str]]:
    return [
        (idx, str(col))
        for idx, col in enumerate(table.columns)
        if "プログラム" in str(col)
        and ("必修/選択" in str(col) or "開講課程前期課程" in str(col))
    ]


def score_program_column_match(column_name: str, org_name: str) -> float:
    col_norm = normalize_for_matching(column_name)
    for noise in ["必修選択", "開講課程前期課程", "開講課程", "前期課程"]:
        col_norm = col_norm.replace(noise, "")

    org_norm = normalize_for_matching(org_name).replace("プログラム", "")
    if not col_norm or not org_norm:
        return 0.0

    if org_norm in col_norm:
        return 1.0

    seq = SequenceMatcher(None, col_norm, org_norm).ratio()
    overlap = len(set(org_norm) & set(col_norm)) / max(1, len(set(org_norm)))
    return max(seq, overlap * 0.95)


def resolve_program_columns(
    df: pd.DataFrame,
    master_program_orgs: dict[str, Organization],
) -> list[tuple[int, str, str]]:
    resolved: list[tuple[int, str, str]] = []
    used_org_ids: set[str] = set()

    for col_idx, col_name in get_program_columns(df):
        best_org_id = None
        best_score = 0.0

        for org_id, org in master_program_orgs.items():
            if org_id in used_org_ids:
                continue
            score = score_program_column_match(col_name, org.name)
            if score > best_score:
                best_score = score
                best_org_id = org_id

        if best_org_id is None or best_score < 0.45:
            print(
                f"Warning: Could not resolve program column '{col_name}' (index={col_idx})"
            )
            continue

        used_org_ids.add(best_org_id)
        resolved.append((col_idx, col_name, best_org_id))

    return resolved


def is_common_table(table: pd.DataFrame) -> bool:
    return (
        has_column_keyword(table, "授業科目名")
        and has_column_keyword(table, "単位数")
        and has_column_keyword(table, "開講課程前期課程")
        and has_column_keyword(table, "開講課程後期課程")
    )


def is_master_program_table(table: pd.DataFrame) -> bool:
    return (
        has_column_keyword(table, "授業科目")
        and has_column_keyword(table, "単位数")
        and has_column_keyword(table, "科目区分")
        and len(get_program_columns(table)) > 0
    )


def is_specific_program_table(table: pd.DataFrame) -> bool:
    return any("必修/選択(プログラム)" in str(col) for col in table.columns)


def is_legacy_program_table(table: pd.DataFrame) -> bool:
    return (
        any("開講課程前期課程(プログラム)" in str(col) for col in table.columns)
        and not is_specific_program_table(table)
    )


def is_doctor_table(table: pd.DataFrame) -> bool:
    return (
        has_column_keyword(table, "授業科目")
        and has_column_keyword(table, "単位数")
        and has_column_keyword(table, "必修/選択")
        and len(get_program_columns(table)) == 0
    )


def infer_doctor_org_from_title(
    title: str,
    doctor_orgs: dict[str, Organization],
) -> str | None:
    title_norm = normalize_for_matching(title)
    if not title_norm:
        return None

    best_org_id = None
    best_score = 0.0

    for org_id, org in doctor_orgs.items():
        org_norm = normalize_for_matching(org.name)
        for suffix in ["博士後期課程", "博士前期課程"]:
            org_norm = org_norm.replace(suffix, "")
        if not org_norm:
            continue

        if org_norm in title_norm:
            return org_id

        score = SequenceMatcher(None, title_norm, org_norm).ratio()
        if score > best_score:
            best_score = score
            best_org_id = org_id

    if best_score >= 0.6:
        return best_org_id
    return None


def iter_doctor_tables(
    tables: list[pd.DataFrame],
    doctor_orgs: dict[str, Organization],
) -> list[tuple[str, pd.DataFrame]]:
    resolved: list[tuple[str, pd.DataFrame]] = []
    current_org_id: str | None = None

    for table in tables:
        title = str(table.attrs.get("title", ""))
        inferred = infer_doctor_org_from_title(title, doctor_orgs)
        if inferred is not None:
            current_org_id = inferred
        elif title and "専攻" in normalize_handbook_name(title):
            # Unknown department title should not inherit the previous one.
            current_org_id = None

        if not is_doctor_table(table):
            continue

        if current_org_id is None:
            if title:
                # Unknown titled section (e.g., dedicated tracks handled elsewhere).
                continue
            page = table.attrs.get("page", "unknown")
            print(
                f"Warning: Doctoral table at page {page} has no inferred target organization"
            )
            continue

        resolved.append((current_org_id, table))

    return resolved


def ensure_course(
    entries: list[dict],
    by_id: dict[str, dict],
    by_no_code_key: dict[tuple[str, int], dict],
    name: str,
    credits: int,
    org_ids: list[str],
) -> str:
    key = (normalize_handbook_name(name), credits)
    course = by_no_code_key.get(key)

    if course is None:
        course = {
            "id": generate_id("uar:education/"),
            "name": {"ja": key[0]},
            "numberOfCredits": credits,
            "organizations": sorted(set(org_ids)),
        }
        entries.append(course)
        by_no_code_key[key] = course
        by_id[course["id"]] = course
    else:
        merged = sorted(set(course.get("organizations", [])) | set(org_ids))
        course["organizations"] = merged

    return course["id"]


def should_reset_grad_entry(entry: dict) -> bool:
    if entry.get("codeMappings"):
        return False
    orgs = set(entry.get("organizations", []))
    if not orgs:
        return False
    return orgs.issubset(RESET_ORG_SCOPE)


def build_course_indexes(entries: list[dict]) -> tuple[dict[str, dict], dict[tuple[str, int], dict]]:
    by_id = {e["id"]: e for e in entries}
    by_no_code_key: dict[tuple[str, int], dict] = {}
    for e in entries:
        if e.get("codeMappings"):
            continue
        key = (normalize_handbook_name(e["name"]["ja"]), e["numberOfCredits"])
        by_no_code_key[key] = e
    return by_id, by_no_code_key


def load_courses(reset: bool) -> tuple[dict, list[dict], dict[str, dict], dict[tuple[str, int], dict]]:
    path = Path("data/education/courses.json")
    payload = json.loads(path.read_text(encoding="utf-8"))
    entries = payload.get("entries", [])
    if reset:
        entries = [e for e in entries if not should_reset_grad_entry(e)]

    by_id, by_no_code_key = build_course_indexes(entries)

    return payload, entries, by_id, by_no_code_key


def save_courses(payload: dict, entries: list[dict]) -> None:
    payload["entries"] = entries
    Path("data/education/courses.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def curriculum_path_for_org(org_id: str, year: int) -> Path:
    org = load_organizations()[org_id]
    return Path(f"data/education/curriculums/{year}") / f"{org.file_basename}.json"


def load_curriculum(org_id: str, year: int, reset: bool) -> dict:
    if reset:
        return {"type": "Curriculum", "year": year, "entries": []}

    path = curriculum_path_for_org(org_id, year)
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return {"type": "Curriculum", "year": year, "entries": []}


def save_curriculum(org_id: str, year: int, payload: dict) -> None:
    path = curriculum_path_for_org(org_id, year)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False,
                    indent=2), encoding="utf-8")


def get_or_create_mapping_entry(curriculum: dict, org_id: str, category_id: str) -> dict:
    for e in curriculum["entries"]:
        if (
            e.get("type") == "CourseCategoryMapping"
            and e.get("targetOrganization") == org_id
            and e.get("category") == category_id
        ):
            e.setdefault("courses", [])
            return e

    org_name = load_organizations()[org_id].name
    category_name = CATEGORY_NAMES.get(category_id, "(unknown)")
    entry = {
        "id": generate_id("uar:education/"),
        "name": {"ja": f"{org_name} - {category_name}"},
        "type": "CourseCategoryMapping",
        "targetOrganization": org_id,
        "category": category_id,
        "courses": [],
    }
    curriculum["entries"].append(entry)
    return entry


def add_course_to_curriculum(curriculums: dict[str, dict], org_ids: list[str], category_id: str, course_id: str) -> None:
    for org_id in org_ids:
        if org_id not in curriculums:
            raise RuntimeError(
                "curriculums must be initialized before adding courses")
        entry = get_or_create_mapping_entry(
            curriculums[org_id], org_id, category_id)
        if course_id not in entry["courses"]:
            entry["courses"].append(course_id)


def reconcile_grad_course_organizations(
    entries: list[dict],
    touched_course_orgs: dict[str, set[str]],
) -> None:
    """今回の再取り込み結果で、大学院no-code科目のorganizationsのみを正規化する。"""
    for entry in entries:
        if entry.get("codeMappings"):
            continue

        current_orgs = set(entry.get("organizations", []))
        preserved_orgs = current_orgs - RESET_ORG_SCOPE
        desired_grad_orgs = touched_course_orgs.get(entry["id"], set())

        # 再取り込みで触れた科目は結果で上書き。触れていない科目は既存の非対象組織のみ保持。
        if desired_grad_orgs:
            entry["organizations"] = sorted(preserved_orgs | desired_grad_orgs)
        elif current_orgs & RESET_ORG_SCOPE:
            entry["organizations"] = sorted(preserved_orgs)


def prune_curriculum_memberships(
    curriculums: dict[str, dict],
    course_by_id: dict[str, dict],
) -> None:
    """科目側organizationsと矛盾するカリキュラム所属を除去する。"""
    for org_id, curriculum in curriculums.items():
        for entry in curriculum.get("entries", []):
            if entry.get("type") != "CourseCategoryMapping":
                continue
            if entry.get("targetOrganization") != org_id:
                continue

            original_courses = entry.get("courses", [])
            pruned_courses = []
            for course_id in original_courses:
                course = course_by_id.get(course_id)
                if not course:
                    continue
                if org_id in set(course.get("organizations", [])):
                    pruned_courses.append(course_id)
            entry["courses"] = pruned_courses


def process_common_tables(
    tables: list[pd.DataFrame],
    entries: list[dict],
    by_id: dict[str, dict],
    by_no_code_key: dict[tuple[str, int], dict],
    curriculums: dict[str, dict],
    touched_course_orgs: dict[str, set[str]],
) -> int:
    added = 0

    all_master = sorted(MASTER_PROGRAM_ORGS.keys())
    all_doctor = sorted(DOCTOR_ORGS.keys())

    for table in [table for table in tables if is_common_table(table)]:
        subject_name_col_count = sum(
            1 for col in table.columns if "授業科目名" in str(col)
        )
        is_special_common_table = subject_name_col_count >= 2

        for _, row in table.iterrows():
            name = normalize_handbook_name(get_cell_text(row, "授業科目名"))
            credits = get_cell_int(row, "単位数")
            if not name or credits is None:
                continue

            if is_special_common_table:
                if "大学院輪講" in name:
                    category_id = get_category_id("大学院輪講")
                elif name == "大学院技術英語":
                    category_id = get_category_id("大学院実践教育科目")
                else:
                    continue
            else:
                category_id = get_category_id("大学院基礎教育科目")

            target_orgs = []
            if is_marked(get_cell_text(row, "開講課程前期課程", prefer_last=False)):
                target_orgs.extend(all_master)
            if is_marked(get_cell_text(row, "開講課程後期課程", prefer_last=False)):
                target_orgs.extend(all_doctor)
            target_orgs = sorted(set(target_orgs))
            if not target_orgs:
                continue

            course_id = ensure_course(
                entries, by_id, by_no_code_key, name, credits, target_orgs)
            touched_course_orgs.setdefault(
                course_id, set()).update(target_orgs)
            add_course_to_curriculum(
                curriculums, target_orgs, category_id, course_id)
            added += 1

    return added


def process_master_program_table(
    table: pd.DataFrame,
    entries: list[dict],
    by_id: dict[str, dict],
    by_no_code_key: dict[tuple[str, int], dict],
    curriculums: dict[str, dict],
    master_program_orgs: dict[str, Organization],
    touched_course_orgs: dict[str, set[str]],
    preferred_course_ids: set[str] | None = None,
) -> int:
    added = 0

    course_col = first_column(list(table.columns), "授業科目")
    credit_col = first_column(list(table.columns), "単位数")
    if not course_col or not credit_col:
        return 0

    program_columns = resolve_program_columns(table, master_program_orgs)
    if not program_columns:
        return 0

    prev_cat: str | None = None
    for _, row in table.iterrows():
        name = normalize_handbook_name(get_cell_text(row, course_col))
        credits = get_cell_int(row, credit_col)
        if not name or credits is None:
            continue

        # 新フォーマット表で既に確定した科目は、旧フォーマット表からの再付与を抑止する。
        if preferred_course_ids:
            existing = by_no_code_key.get(
                (normalize_handbook_name(name), credits))
            if existing and existing["id"] in preferred_course_ids:
                continue

        raw_cat = normalize_handbook_name(get_cell_text(row, "科目区分"))
        if raw_cat == "*":
            raw_cat = "専門科目Ⅱ"

        has_any_program_mark = False
        for col_idx, _col_name, org_id in program_columns:
            mark = get_cell_text_by_index(row, col_idx)
            if not is_marked(mark):
                continue
            has_any_program_mark = True

            category_label = raw_cat
            has_a = "A" in mark
            has_b = "B" in mark
            if not category_label or category_label in {"*", "専門科目Ⅱ"}:
                if has_a and not has_b:
                    category_label = "専門科目Ⅱ(A)"
                elif has_b and not has_a:
                    category_label = "専門科目Ⅱ(B)"

            category_id = parse_category(
                category_label,
                course_name=name,
                fallback=prev_cat,
            )
            if category_id is None:
                continue

            course_id = ensure_course(
                entries, by_id, by_no_code_key, name, credits, [org_id])
            touched_course_orgs.setdefault(course_id, set()).add(org_id)
            add_course_to_curriculum(
                curriculums, [org_id], category_id, course_id)
            added += 1

        if not has_any_program_mark:
            continue

        parsed_raw = parse_category(
            raw_cat, course_name=name, fallback=prev_cat)
        if parsed_raw is not None:
            prev_cat = parsed_raw

    return added


def process_doctor_table(
    table: pd.DataFrame,
    org_id: str,
    entries: list[dict],
    by_id: dict[str, dict],
    by_no_code_key: dict[tuple[str, int], dict],
    curriculums: dict[str, dict],
    touched_course_orgs: dict[str, set[str]],
) -> int:
    added = 0

    course_col = first_column(list(table.columns), "授業科目")
    credit_col = first_column(list(table.columns), "単位数")
    if not course_col or not credit_col:
        return 0

    mark_cols = [c for c in table.columns if "必修/選択" in c]
    prev_cat: str | None = None

    for _, row in table.iterrows():
        name = normalize_handbook_name(get_cell_text(row, course_col))
        credits = get_cell_int(row, credit_col)
        if not name or credits is None:
            continue

        marks = [get_cell_text(row, c, prefer_last=False) for c in mark_cols]
        if not any(is_marked(m) for m in marks):
            continue

        raw_cat = normalize_handbook_name(get_cell_text(row, "科目区分"))
        if raw_cat == "*":
            raw_cat = "専門科目Ⅱ"

        category_id = parse_category(
            raw_cat, course_name=name, fallback=prev_cat)
        if category_id is None:
            continue
        prev_cat = category_id

        course_id = ensure_course(
            entries, by_id, by_no_code_key, name, credits, [org_id])
        touched_course_orgs.setdefault(course_id, set()).add(org_id)
        add_course_to_curriculum(curriculums, [org_id], category_id, course_id)
        added += 1

    return added


def resolve_input_pkl(year: int, profile: str, input_pkl: str | None) -> Path | None:
    if input_pkl:
        path = Path(input_pkl)
        return path if path.exists() else None

    pattern = f"generated/handbook_tables_{year}_*_{profile}_*.pkl"
    candidates = [Path(p) for p in glob(pattern)]
    if not candidates:
        return None

    # 複数候補がある場合は更新時刻の新しいものを優先
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


def load_source_tables(
    year: int,
    input_pkl: str | None,
    input_pdf: str | None,
    profile: str,
) -> list[pd.DataFrame]:
    pkl_path = resolve_input_pkl(year, profile, input_pkl)
    if pkl_path is not None:
        return pickle.loads(pkl_path.read_bytes())

    if input_pdf:
        return extract_handbook_tables(year, input_pdf, profile=profile)

    raise FileNotFoundError(
        "No handbook source found. Provide --input-pdf, or place a matching PKL under "
        f"generated/ (pattern: handbook_tables_{year}_*_{profile}_*.pkl)."
    )


def run(year: int, reset: bool, input_pkl: str | None, input_pdf: str | None, profile: str) -> None:
    tables: list[pd.DataFrame] = load_source_tables(
        year=year,
        input_pkl=input_pkl,
        input_pdf=input_pdf,
        profile=profile,
    )

    payload, entries, by_id, by_no_code_key = load_courses(reset=reset)

    if reset:
        for legacy_org_id in LEGACY_MASTER_ORG_IDS:
            legacy_path = curriculum_path_for_org(legacy_org_id, year)
            if legacy_path.exists():
                legacy_path.unlink()

    curriculums: dict[str, dict] = {}
    for org_id in TARGET_GRAD_ORGS:
        curriculums[org_id] = load_curriculum(org_id, year, reset=reset)

    touched_course_orgs: dict[str, set[str]] = {}

    added_rows = 0
    added_rows += process_common_tables(tables,
                                        entries, by_id, by_no_code_key, curriculums, touched_course_orgs)

    master_table_count = 0
    specific_tables = [
        table for table in tables if is_master_program_table(table) and is_specific_program_table(table)
    ]
    legacy_tables = [
        table for table in tables if is_master_program_table(table) and is_legacy_program_table(table)
    ]
    specific_table_ids = {id(table) for table in specific_tables}
    legacy_table_ids = {id(table) for table in legacy_tables}
    other_master_tables = [
        table
        for table in tables
        if is_master_program_table(table)
        and id(table) not in specific_table_ids
        and id(table) not in legacy_table_ids
    ]

    preferred_course_ids: set[str] = set()

    for table in specific_tables:
        added_rows += process_master_program_table(
            table,
            entries,
            by_id,
            by_no_code_key,
            curriculums,
            MASTER_PROGRAM_ORGS,
            touched_course_orgs,
        )
        master_table_count += 1

    preferred_course_ids.update(touched_course_orgs.keys())

    for table in legacy_tables:
        added_rows += process_master_program_table(
            table,
            entries,
            by_id,
            by_no_code_key,
            curriculums,
            MASTER_PROGRAM_ORGS,
            touched_course_orgs,
            preferred_course_ids=preferred_course_ids,
        )
        master_table_count += 1

    for table in other_master_tables:
        added_rows += process_master_program_table(
            table,
            entries,
            by_id,
            by_no_code_key,
            curriculums,
            MASTER_PROGRAM_ORGS,
            touched_course_orgs,
        )
        master_table_count += 1

    doctor_table_count = 0
    for org_id, table in iter_doctor_tables(tables, DOCTOR_ORGS):
        added_rows += process_doctor_table(
            table,
            org_id,
            entries,
            by_id,
            by_no_code_key,
            curriculums,
            touched_course_orgs,
        )
        doctor_table_count += 1

    reconcile_grad_course_organizations(entries, touched_course_orgs)
    prune_curriculum_memberships(curriculums, by_id)

    save_courses(payload, entries)
    for org_id, curriculum in curriculums.items():
        save_curriculum(org_id, year, curriculum)

    print(f"Processed rows: {added_rows}")
    print(f"Master program tables processed: {master_table_count}")
    print(f"Doctoral tables processed: {doctor_table_count}")
    print(f"Updated courses: data/education/courses.json")
    print(f"Updated curricula: {len(curriculums)} files")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Generate graduate IE courses and curriculum mappings for 2026."
    )
    parser.add_argument(
        "--input-pkl",
        default=None,
        help="Path to extracted handbook tables (.pkl)",
    )
    parser.add_argument(
        "--input-pdf",
        default=None,
        help="Path to handbook PDF. Used when --input-pkl is omitted or not found.",
    )
    parser.add_argument(
        "--profile",
        default="ie",
        help="Extraction profile name used in generated PKL filename matching.",
    )
    parser.add_argument(
        "--year",
        type=int,
        default=2026,
        help="Academic year for output curriculum paths and payload.",
    )
    parser.add_argument(
        "--no-reset",
        action="store_true",
        help="Do not reset previously generated graduate no-code entries before merging.",
    )
    args = parser.parse_args()

    run(
        year=args.year,
        reset=not args.no_reset,
        input_pkl=args.input_pkl,
        input_pdf=args.input_pdf,
        profile=args.profile,
    )
