import httpx
from .people import Person
from selectolax.lexbor import LexborHTMLParser
import sys
from .utils import save_people
import os
import hashlib
from ..gen_id import generate_id


CAREER_URL = "https://www.career.ce.uec.ac.jp/faculty/"
CACHE_DIR = ".cache/people"
HEADERS = {
    "User-Agent": "UEC-Atlas/1.0 (+https://github.com/uec-atlas/uec-atlas)"
}


def get_cache_path(url: str) -> str:
    hashed = hashlib.md5(url.encode()).hexdigest()
    return os.path.join(CACHE_DIR, f"{hashed}.html")


def load_career_professors():
    client = httpx.Client()
    response = client.get(CAREER_URL, headers=HEADERS)
    response.raise_for_status()
    html_content = response.text
    parser = LexborHTMLParser(html_content)
    professor_rows = parser.css(".stuff-list li .stuff-ttl")
    professors = []
    for row in professor_rows:
        name = row.css_first("h3").text().strip()
        post = row.css_first("h4").text().strip()
        member_of = []
        if "共通教育部" in post:
            member_of.append("共通教育部")
        else:
            member_of.append("情報理工学域")
        professors.append(Person(
            id=generate_id("uar:people/"),
            name=name,
            name_en=None,
            alternative_names=None,
            alternative_names_en=None,
            member_of=member_of,
            is_based_on=CAREER_URL
        ))
    return professors


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python gen_career_professors.py <output_file>")
        sys.exit(1)
    output_file = sys.argv[1]
    save_people(load_career_professors(), output_file)
