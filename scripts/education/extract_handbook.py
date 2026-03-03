from ..gen_id import generate_id
from .extract_tables import extract_tables
from typing import List, Dict, Tuple
from dataclasses import dataclass, field
import re
import os
import json
import argparse
import sys
import pandas as pd
from pathlib import Path

# --- 定数およびユーティリティ ---


def normalize_name(name: str) -> str:
    """授業科目名を正規化する（記号、空白の除去）。"""
    if not isinstance(name, str):
        return ""
    name = re.sub(r"[★☆※\n\r]", "", name)

    roman_map = {
        "VIII": "Ⅷ", "VII": "Ⅶ", "III": "Ⅲ",
        "VI": "Ⅵ", "IV": "Ⅳ", "II": "Ⅱ", "IX": "Ⅸ",
        "V": "Ⅴ", "X": "Ⅹ", "I": "Ⅰ"
    }

    def replace_roman(match):
        text = match.group(0)
        return roman_map.get(text, text)

    name = re.sub(r"(?<![a-zA-Z])[IVX]+(?![a-zA-Z])", replace_roman, name)
    name = re.sub(r"([a-zA-Z])([\u2160-\u216F])", r"\1 \2", name)
    name = re.sub(r"([a-z])([A-Z])", r"\1 \2", name)
    name = re.sub(r"\s+", " ", name)
    return name.strip()


def get_suffix(code: str) -> str:
    """科目コードから Suffix（末尾の英小文字1文字）を抽出する。"""
    match = re.search(r"([a-z])$", code)
    return match.group(1) if match else ""


def canonicalize(name: str) -> str:
    """比較用にすべてのノイズを除去する (完全な名寄せ用キー)"""
    s = normalize_name(name)
    s = re.sub(r"\s+", "", s)
    return s.lower()


def load_handbook_corrections() -> List[Dict]:
    base = os.path.dirname(__file__)
    json_path = os.path.join(base, "corrections/replacement.json")
    with open(json_path, "r", encoding="utf-8") as f:
        return json.load(f) or []


def matches_search(search: Dict, year: int, code: str, name: str, page: int = None) -> bool:
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
        if canonicalize(name) != canonicalize(str(search["name"])):
            return False

    return True


def apply_corrections_for_row(corrections: List[Dict], year: int, code: str, name: str, credits: int, page: int = None) -> Tuple[str, str, int]:
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


@dataclass
class CodeMapping:
    code: str
    years: List[int]

    def to_dict(self) -> Dict:
        return {
            "code": self.code,
            "years": sorted(list(set(self.years)))
        }


@dataclass
class Course:
    id: str
    name: str
    credits: int
    code_mappings: List[CodeMapping] = field(default_factory=list)

    @property
    def identity_key(self) -> Tuple[str, int, str]:
        """名寄せ用の複合キーを生成する (正規化名, 単位数, Suffix)。"""
        suffix = get_suffix(
            self.code_mappings[0].code) if self.code_mappings else ""
        return (canonicalize(self.name), self.credits, suffix)

    def to_dict(self) -> Dict:
        """JSON-LD 用の辞書（camelCase）に変換する。"""
        return {
            "id": f"uar:curriculum/{self.id}",
            "name": {
                "ja": self.name
            },
            "credits": self.credits,
            "codeMappings": [m.to_dict() for m in self.code_mappings]
        }

# --- メインロジック ---


class CourseRegistry:
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.courses: List[Course] = []
        self.load()

    def load(self):
        if not os.path.exists(self.file_path):
            return

        with open(self.file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            entries = data.get("entries", [])
            for entry in entries:
                course_id = entry["id"].split("/")[-1]
                mappings = [
                    CodeMapping(code=m["code"], years=m["years"])
                    for m in entry.get("codeMappings", [])
                ]
                course = Course(
                    id=course_id,
                    name=entry["name"]["ja"],
                    credits=entry["credits"],
                    code_mappings=mappings
                )
                self.courses.append(course)

    def upsert_course(self, year: int, code: str, name: str, credits: int):
        target_key = (canonicalize(name), credits, get_suffix(code))

        target_course = next(
            (c for c in self.courses if c.identity_key == target_key), None)

        if target_course:
            mapping = next(
                (m for m in target_course.code_mappings if m.code == code), None)
            if mapping:
                if year not in mapping.years:
                    mapping.years.append(year)
            else:
                target_course.code_mappings.append(
                    CodeMapping(code=code, years=[year]))
        else:
            self.courses.append(Course(
                id=generate_id(),
                name=normalize_name(name),  # 保存値は正規化済み
                credits=credits,
                code_mappings=[CodeMapping(code=code, years=[year])]
            ))

    def save(self):
        output = {
            "type": "CourseCollection",
            "entries": sorted([c.to_dict() for c in self.courses], key=lambda x: x["name"]["ja"])
        }

        with open(self.file_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Update course registry with year data.")
    parser.add_argument("--year", type=int,
                        help="Academic year to process (e.g., 2025)")
    parser.add_argument("--input", required=True,
                        help="Path to pkl file containing DataFrames")
    parser.add_argument("--output", help="Path to output JSON-LD file")
    args = parser.parse_args()

    registry = CourseRegistry(args.output)

    tables = extract_tables(args.input)

    # CSVオーバーライドの適用
    # scripts/education/corrections/{year}_{page}_*.csv があれば PDF由来のテーブルを置き換える
    final_tables = []
    corr_dir = Path(__file__).parent / "corrections"

    for table in tables:
        page_num = table.attrs.get("page")
        if page_num:
            pattern = f"{args.year}_{page_num}_*.csv"
            csv_paths = sorted(corr_dir.glob(pattern))
            if csv_paths:
                for csv_path in csv_paths:
                    print(f"Overriding page {page_num} with {csv_path.name}")
                    # extract_tables.py と同様のクレンジングを期待するため、
                    # 本来は extract_tables 側で処理するのが綺麗だが、
                    # ここでは指示通り handbook 側で読み込んで差し替える
                    csv_df = pd.read_csv(csv_path, dtype=str).fillna("")
                    # df.attrs を引き継ぐ
                    csv_df.attrs = table.attrs.copy()
                    final_tables.append(csv_df)
                continue
        final_tables.append(table)

    processed_tables = [
        table for table in final_tables
        if all(col in table.columns for col in ["授業科目", "科目番号", "単位数"])
    ]

    # for i, table in enumerate(final_tables):
    #     table.to_csv(
    #         f"processed_table_{i}.csv", index=False, encoding="utf-8")

    # -----
    count = 0
    # 補正データを事前にロード
    corrections = load_handbook_corrections()
    for table in processed_tables:
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
                raw_credits = row["単位数"]
                if isinstance(raw_credits, pd.Series):
                    print(
                        f"Warning: Duplicate column '単位数' found on page {page_num}. Using first value.", file=sys.stderr)
                    raw_credits = raw_credits.iloc[0]

                credits_val = int(float(raw_credits))
                # 補正を適用
                c_code, c_name, c_credits = apply_corrections_for_row(
                    corrections, args.year, code, name, credits_val, page=page_num)
                registry.upsert_course(args.year, c_code, c_name, c_credits)
                count += 1
            except (ValueError, TypeError):
                continue

    registry.save()
    print(
        f"Done. Processed {count} rows. Registry now contains {len(registry.courses)} unique courses.")
