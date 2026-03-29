from .course_registry import CourseRegistry
from .extract_handbook import extract_handbook_tables
import argparse
import sys
import pandas as pd


def generate_course_registry(year: int, input_path: str, output_path: str):
    registry = CourseRegistry(output_path)

    tables = extract_handbook_tables(year, input_path)

    course_list_tables = [
        table for table in tables
        if all(col in table.columns for col in ["授業科目", "科目番号", "単位数"])
    ]

    count = 0
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
            credits = get_val(row, "単位数")

            if not code or code == "nan" or credits == "nan":
                continue

            try:
                credits_val = int(credits)
                registry.upsert_course(year, code, name, credits_val)
                count += 1
            except (ValueError, TypeError):
                continue

    registry.save()
    return registry


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Update course registry with year data.")
    parser.add_argument("--year", type=int,
                        help="Academic year to process (e.g., 2025)")
    parser.add_argument("--input", required=True,
                        help="Path to PDF file containing course data")
    parser.add_argument("--output", help="Path to output JSON-LD file")
    args = parser.parse_args()

    registry = generate_course_registry(args.year, args.input, args.output)

    print(
        f"Done. Processed {sum(len(c.code_mappings) for c in registry.courses)} rows. Registry now contains {len(registry.courses)} unique courses.")
