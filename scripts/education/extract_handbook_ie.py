from .extract_handbook import extract_handbook_tables
import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Extract IE handbook tables."
    )
    parser.add_argument("--year", type=int,
                        help="Academic year to process (e.g., 2026)")
    parser.add_argument("--input", required=True,
                        help="Path to PDF file containing course data")
    parser.add_argument("--output", help="Path to output JSON-LD file")
    args = parser.parse_args()

    tables = extract_handbook_tables(
        year=args.year,
        input_path=args.input,
        profile="ie",
        merge_col_edge_tolerance=120.0,
        normalized_col_edge_tolerance=0.08,
    )

    outdir = Path("generated/handbook_tables_ie")
    outdir.mkdir(exist_ok=True)

    for i, table in enumerate(tables):
        table.to_csv(
            outdir / f"final_table_{i}.csv",
            index=False,
            encoding="utf-8",
        )

    print(
        f"Extracted {len(tables)} tables with IE profile. Output saved to {outdir}."
    )


if __name__ == "__main__":
    main()
