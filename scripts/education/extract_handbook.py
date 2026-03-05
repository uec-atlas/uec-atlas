from .extract_tables import extract_tables, merge_tables
from .utils import canonicalize_subject_name
import pickle
import os
import json
import argparse
import sys
import pandas as pd
from functools import cache
from pathlib import Path

# --- 定数およびユーティリティ ---


def load_handbook_corrections() -> list[dict]:
    base = os.path.dirname(__file__)
    json_path = os.path.join(base, "corrections/replacement.json")
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f) or []


def load_handbook_rotations(year: int) -> list[dict[int, int]]:
    base = os.path.dirname(__file__)
    json_path = os.path.join(base, "corrections/rotation.json")
    with open(json_path, "r", encoding="utf-8") as f:
        values = json.load(f) or []
        rotations = {}
        for entry in values:
            if year in entry.get("year", []):
                rotations[entry["page"]] = entry["angle"]
        return rotations


def matches_search(search: dict, year: int, code: str, name: str, page: int = None) -> bool:
    if "year" in search:
        searchYear = search["year"]
        if isinstance(searchYear, list):
            if year not in searchYear:
                return False
        else:
            if year != searchYear:
                return False

    if "page" in search and page is not None:
        if int(page) != int(search["page"]):
            return False

    if "code" in search:
        if str(code) != str(search["code"]):
            return False

    if "name" in search:
        if canonicalize_subject_name(name) != canonicalize_subject_name(str(search["name"])):
            return False

    return True


def apply_corrections_for_row(corrections: list[dict], year: int, code: str, name: str, credits: int, page: int = None) -> tuple[str, str, int]:
    """行データに対して補正を適用して、(code, name, credits) を返す。"""
    out_code, out_name, out_credits = code, name, credits
    for entry in corrections:
        search = entry.get("search", {})
        replace = entry.get("replace", {})
        if matches_search(search, year, out_code, out_name, page):
            if "code" in replace:
                out_code = replace["code"]
            if "name" in replace:
                out_name = replace["name"]
            if "credits" in replace:
                out_credits = replace["credits"]
    return out_code, out_name, out_credits


@cache
def extract_handbook_tables(year: int, input_path: str) -> list[pd.DataFrame]:
    output = Path(f"generated/handbook_tables_{year}.pkl")
    if output.exists():
        return pickle.loads(output.read_bytes())

    tables = extract_tables(
        input_path, None, load_handbook_rotations(year))

    final_tables = []
    corr_dir = Path(__file__).parent / "corrections"

    for table in tables:
        page_num = table.attrs.get("page")
        if page_num:
            pattern = f"{year}_{page_num}_*.csv"
            csv_paths = sorted(corr_dir.glob(pattern))
            if csv_paths:
                for csv_path in csv_paths:
                    csv_df = pd.read_csv(csv_path, dtype=str).fillna("")
                    csv_df.attrs = table.attrs.copy()
                    final_tables.append(csv_df)
                continue
        final_tables.append(table)

    final_tables = merge_tables(final_tables)
    for table in final_tables:
        if not "title" in table.attrs:
            table.attrs["title"] = "Unnamed Table"

    course_list_tables = [
        table for table in final_tables
        if all(col in table.columns for col in ["授業科目", "科目番号", "単位数"])
    ]

    corrections = load_handbook_corrections()
    for table in course_list_tables:
        page_num = table.attrs.get("page")
        for _, row in table.iterrows():
            def get_val(row, col):
                val = row[col]
                if isinstance(val, pd.Series):
                    print(
                        f"Warning: Duplicate column '{col}' found on page {page_num}. Using first value.", file=sys.stderr)
                    return str(val.iloc[0]).strip()
                return str(val).strip()

            code = get_val(row, "科目番号")
            name = get_val(row, "授業科目")

            if not code or code == "nan":
                continue

            try:
                raw_credits = get_val(row, "単位数")
                credits_val = int(raw_credits)
                c_code, c_name, c_credits = apply_corrections_for_row(
                    corrections, year, code, name, credits_val, page=page_num)
                row["科目番号"] = c_code
                row["授業科目"] = c_name
                row["単位数"] = c_credits
            except (ValueError, TypeError):
                continue

    output.write_bytes(pickle.dumps(final_tables))
    return final_tables


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Update course registry with year data.")
    parser.add_argument("--year", type=int,
                        help="Academic year to process (e.g., 2025)")
    parser.add_argument("--input", required=True,
                        help="Path to pkl file containing DataFrames")
    parser.add_argument("--output", help="Path to output JSON-LD file")
    args = parser.parse_args()
    tables = extract_handbook_tables(args.year, args.input)
    outdir = Path("generated/handbook_tables")
    outdir.mkdir(exist_ok=True)
    for i, table in enumerate(tables):
        table.to_csv(
            outdir / f"final_table_{i}.csv", index=False, encoding="utf-8")
    print(
        f"Extracted {len(tables)} tables with corrections applied. Output saved to {outdir}.")
