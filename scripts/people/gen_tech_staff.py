import httpx
from .people import Person
from selectolax.lexbor import LexborHTMLParser
import sys
import os
import hashlib
from .utils import save_people
from ..gen_id import generate_id


TECH_URL = "https://www.tech.uec.ac.jp/about/member.html"
CACHE_DIR = ".cache/people"


def get_cache_path(url: str) -> str:
    hashed = hashlib.md5(url.encode()).hexdigest()
    return os.path.join(CACHE_DIR, f"{hashed}.html")


def load_tech_staff():
    client = httpx.Client()
    response = client.get(TECH_URL)
    response.raise_for_status()
    html_content = response.text
    parser = LexborHTMLParser(html_content)
    staff_items = parser.css("#main table th")
    staff = []
    for node in staff_items:
        name = node.text().strip()
        staff.append(Person(
            id=generate_id("uar:people/"),
            name=name,
            name_en=None,
            alternative_names=None,
            alternative_names_en=None,
            member_of=["教育研究技師部"],
            is_based_on=TECH_URL
        ))
    return staff


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python gen_tech_staff.py <output_file>")
        sys.exit(1)
    output_file = sys.argv[1]
    save_people(load_tech_staff(), output_file)
