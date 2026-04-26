import asyncio
import httpx
from dataclasses import dataclass
from selectolax.lexbor import LexborHTMLParser
from tqdm.asyncio import tqdm
import sys
import json
import os
import hashlib


@dataclass
class SyllabusCourse:
    semester: str
    term: str
    periods: str
    credits: int
    name: str
    name_en: str = None
    instructors: str = None
    numbering_codes: str = None
    year_offered: str = None
    timetable_code: str = None
    url: str = None

    def __hash__(self):
        return hash(self.timetable_code)


LIMITS = httpx.Limits(max_connections=5, max_keepalive_connections=5)
CONCURRENCY_LIMIT = 5
CACHE_DIR = ".cache/syllabuses"
HEADERS = {
    "User-Agent": "UEC-Atlas/1.0 (+https://github.com/uec-atlas/uec-atlas)"
}


def get_cache_path(url: str) -> str:
    hashed = hashlib.md5(url.encode()).hexdigest()
    return os.path.join(CACHE_DIR, f"{hashed}.html")


async def fill_course_details(client: httpx.AsyncClient, course: SyllabusCourse, semaphore: asyncio.Semaphore):
    async with semaphore:
        try:
            cache_path = get_cache_path(course.url)
            html_content = None

            if os.path.exists(cache_path):
                with open(cache_path, "r", encoding="utf-8") as f:
                    html_content = f.read()
            else:
                await asyncio.sleep(0.5)
                response = await client.get(course.url, timeout=10.0, headers=HEADERS)
                response.raise_for_status()
                html_content = response.text
                os.makedirs(CACHE_DIR, exist_ok=True)
                with open(cache_path, "w", encoding="utf-8") as f:
                    f.write(html_content)

            parser = LexborHTMLParser(html_content)

            node_en = parser.css_first(
                "body > table:nth-child(8) > tbody > tr:nth-child(2) > td")
            node_code = parser.css_first(
                "body > table:nth-child(8) > tbody > tr:nth-child(3) > td")
            node_year_offered = parser.css_first(
                "body > table:nth-child(8) > tbody > tr:nth-child(4) > td:nth-child(4)")
            node_credits = parser.css_first(
                "body > table:nth-child(8) > tbody > tr:nth-child(6) > td:nth-child(4)")

            if node_en:
                course.name_en = node_en.text().strip()
            if node_code:
                course.numbering_codes = node_code.text().strip()
            if node_year_offered:
                course.year_offered = node_year_offered.text().strip()
            if node_credits:
                try:
                    course.credits = int(node_credits.text().strip())
                except ValueError:
                    pass

        except Exception as e:
            print(f"Failed: {course.url} - {e}")


async def load_syllabuses(root_url: str) -> list[SyllabusCourse]:
    async with httpx.AsyncClient(limits=LIMITS, http2=False) as client:
        # ルートURLもキャッシュ
        root_cache_path = get_cache_path(root_url)
        if os.path.exists(root_cache_path):
            with open(root_cache_path, "r", encoding="utf-8") as f:
                root_html = f.read()
        else:
            response = await client.get(root_url, headers=HEADERS)
            response.raise_for_status()
            root_html = response.text
            os.makedirs(CACHE_DIR, exist_ok=True)
            with open(root_cache_path, "w", encoding="utf-8") as f:
                f.write(root_html)

        parser = LexborHTMLParser(root_html)
        syllabus_rows = parser.css(
            "body > table > tbody > tr:nth-child(4) > td > table > tbody:nth-child(3) > tr")

        courses = []
        base_url = root_url.rsplit("/", 1)[0] + "/"

        for row in syllabus_rows:
            course = SyllabusCourse(
                semester=row.css_first("td:nth-child(2)").text().strip(),
                term=row.css_first("td:nth-child(3)").text().strip(),
                periods=row.css_first("td:nth-child(4)").text().strip(),
                timetable_code=row.css_first("td:nth-child(5)").text().strip(),
                name=row.css_first("td:nth-child(6)").text().strip(),
                name_en=None,
                instructors=row.css_first("td:nth-child(7)").text().strip(),
                numbering_codes=None,
                credits=0,
                url=base_url + row.css_first(
                    "td:nth-child(6) > a").attrs.get("href", "")
            )
            courses.append(course)

        semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)
        tasks = [fill_course_details(client, course, semaphore)
                 for course in courses]
        await tqdm.gather(*tasks, desc="Loading syllabuses")

        return courses

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python load_syllabuses.py <syllabus_url> <output_file>")
        sys.exit(1)
    url = sys.argv[1]
    output_file = sys.argv[2]
    courses = asyncio.run(load_syllabuses(url))
    with open(output_file, "w", encoding="utf-8") as f:
        json.dump([course.__dict__ for course in courses],
                  f, ensure_ascii=False, indent=2)
