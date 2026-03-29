
import argparse
import re

from .extract_handbook import extract_handbook_tables
from .gen_curriculum import generate_curriculum
from .gen_course_collection import generate_course_registry


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Update course registry with year data.")
    parser.add_argument("--year", type=int,
                        help="Academic year to process (e.g., 2025)")
    parser.add_argument("--input", required=True,
                        help="Path to PDF file containing course data")
    args = parser.parse_args()
    if not args.year:
        args.year = int(re.search(r"(\d{4})", args.input).group(1))

    print("Generating course registry...")
    registry = generate_course_registry(
        args.year, args.input, "data/education/courses.json")

    print("Generating curriculum...")
    generate_curriculum(args.year, args.input)
