import asyncio
import httpx
from dataclasses import dataclass
from selectolax.lexbor import LexborHTMLParser
from tqdm.asyncio import tqdm
import sys


@dataclass
class SyllabusCourse:
    semester: str
    term: str
    periods: str
    name: str
    name_en: str = None
    instructors: str = None
    numbering_codes: str = None
    timetable_code: str = None
    url: str = None


LIMITS = httpx.Limits(max_connections=10, max_keepalive_connections=5)
CONCURRENCY_LIMIT = 5


async def fill_course_details(client: httpx.AsyncClient, course: SyllabusCourse, semaphore: asyncio.Semaphore):
    async with semaphore:
        try:
            await asyncio.sleep(0.5)

            response = await client.get(course.url, timeout=10.0)
            response.raise_for_status()

            parser = LexborHTMLParser(response.text)

            node_en = parser.css_first(
                "body > table:nth-child(8) > tbody > tr:nth-child(2) > td")
            node_code = parser.css_first(
                "body > table:nth-child(8) > tbody > tr:nth-child(3) > td")

            if node_en:
                course.name_en = node_en.text().strip()
            if node_code:
                course.numbering_codes = node_code.text().strip()

        except Exception as e:
            print(f"Failed: {course.url} - {e}")


async def load_syllabuses(root_url: str):
    async with httpx.AsyncClient(limits=LIMITS, http2=False) as client:
        response = await client.get(root_url)
        response.raise_for_status()

        parser = LexborHTMLParser(response.text)
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
                url=base_url + row.css_first(
                    "td:nth-child(6) > a").attrs.get("href", "")
            )
            courses.append(course)

        semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)
        tasks = [fill_course_details(client, course, semaphore)
                 for course in courses]
        await tqdm.gather(*tasks, desc="Loading syllabuses")

    for course in courses:
        print(f"[{course.numbering_codes}] {course.name} / {course.name_en}")

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python load_syllabuses.py <syllabus_url>")
        sys.exit(1)
    url = sys.argv[1]
    asyncio.run(load_syllabuses(url))
