import asyncio
import re
import httpx
from . import utils as people_utils
from .. import utils
from .people import Person
from selectolax.lexbor import LexborHTMLParser
from tqdm.asyncio import tqdm
import sys
import json
import os
import hashlib
from ..gen_id import generate_id


ROOT_URL = "https://www.uec.ac.jp/research/information/"
LIMITS = httpx.Limits(max_connections=5, max_keepalive_connections=5)
CONCURRENCY_LIMIT = 5
CACHE_DIR = ".cache/people"
HEADERS = {
    "User-Agent": "UEC-Atlas/1.0 (+https://github.com/uec-atlas/uec-atlas)"
}


def get_cache_path(url: str) -> str:
    hashed = hashlib.md5(url.encode()).hexdigest()
    return os.path.join(CACHE_DIR, f"{hashed}.html")


async def fill_researcher_details(client: httpx.AsyncClient, researcher: Person, semaphore: asyncio.Semaphore):
    async with semaphore:
        try:
            cache_path = get_cache_path(researcher.is_based_on)
            html_content = None

            if os.path.exists(cache_path):
                with open(cache_path, "r", encoding="utf-8") as f:
                    html_content = f.read()
            else:
                await asyncio.sleep(0.5)
                response = await client.get(researcher.is_based_on, timeout=10.0, headers=HEADERS)
                response.raise_for_status()
                html_content = response.text
                os.makedirs(CACHE_DIR, exist_ok=True)
                with open(cache_path, "w", encoding="utf-8") as f:
                    f.write(html_content)

            parser = LexborHTMLParser(html_content)

            # 名字（旧姓）名前パターンを分割
            altname = re.match(
                r"^(\w+?)\s*（(\w+?)）\s*(\w+?)$", researcher.name)
            if altname:
                researcher.name = f"{altname.group(1)} {altname.group(3)}".strip(
                )
                researcher.alternative_names = [
                    f"{altname.group(2)} {altname.group(3)}".strip()]

            name_en = parser.css_first(
                "div.researcher-sidenavi-content-float > p.name > span.name-eng").text().strip()

            if name_en:
                researcher.name_en = name_en.strip()
                if altname:
                    altname_en = re.match(
                        r"^(\w+?)[\s-]*(\w+?)\s*(\w+?)$", name_en)
                    if altname_en:
                        researcher.name_en = f"{altname_en.group(1)} {altname_en.group(3)}".strip(
                        )
                        researcher.alternative_names_en = [
                            f"{altname_en.group(2)} {altname_en.group(3)}".strip()]

        except Exception as e:
            print(f"Failed: {researcher.is_based_on} - {e}")


async def load_researchers():
    async with httpx.AsyncClient(limits=LIMITS, http2=True) as client:
        root_cache_path = get_cache_path(ROOT_URL)
        if os.path.exists(root_cache_path):
            with open(root_cache_path, "r", encoding="utf-8") as f:
                root_html = f.read()
        else:
            response = await client.get(ROOT_URL, headers=HEADERS)
            response.raise_for_status()
            root_html = response.text
            os.makedirs(CACHE_DIR, exist_ok=True)
            with open(root_cache_path, "w", encoding="utf-8") as f:
                f.write(root_html)

        parser = LexborHTMLParser(root_html)
        researcher_rows = parser.css(".member-list li:not(.head)")
        researchers = []
        base_url = ROOT_URL.rsplit("/", 1)[0] + "/"

        for row in researcher_rows:
            course = Person(
                id=generate_id("uar:people/"),
                name=row.css_first(".member-list_cel01 p").text().strip(),
                name_en=None,
                alternative_names=None,
                alternative_names_en=None,
                member_of=[r.text().strip()
                           for r in row.css(".member-list_cel02 p")],
                is_based_on=base_url +
                row.css_first(".member-list_cel01 a")
                .attrs.get("href", "")
                .strip().removeprefix("./")
            )
            researchers.append(course)

        semaphore = asyncio.Semaphore(CONCURRENCY_LIMIT)
        tasks = [fill_researcher_details(client, course, semaphore)
                 for course in researchers]

        await tqdm.gather(*tasks, desc="Loading researchers")

        return researchers

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python gen_researchers.py <output_file>")
        sys.exit(1)
    output_file = sys.argv[1]
    people_utils.save_people(asyncio.run(load_researchers()))
