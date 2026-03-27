from .. import utils
import json
import os

KANJI_VARIANT_TRANSLATION = str.maketrans({
    "廣": "広",
    "髙": "高"
})


def normalize_name(name: str) -> str:
    if not isinstance(name, str):
        return ""
    name = utils.normalize_string(name)
    name = name.title()
    return name.strip()


def canonicalize_instructor_key(name: str) -> str:
    if not isinstance(name, str):
        return ""
    s = utils.normalize_string(name)
    s = s.translate(KANJI_VARIANT_TRANSLATION)
    s = s.replace(" ", "")
    return s.lower()


def save_people(people: list, output_file: str):
    people_saving = []
    if os.path.exists(output_file):
        with open(output_file, "r", encoding="utf-8") as f:
            try:
                existing_data = json.load(f)
                if isinstance(existing_data, list):
                    people_saving = existing_data
            except json.JSONDecodeError:
                pass
    with open(output_file, "w", encoding="utf-8") as f:
        existing_names = [r["name"]["ja"]
                          for r in people_saving]
        existing_name_segments = [set(name.split(" "))
                                  for name in existing_names]
        for person in people:
            if set(normalize_name(person.name).split(" ")) in existing_name_segments or any(name.replace(" ", "") == person.name.replace(" ", "") for name in existing_names):
                continue
            people_saving.append(person.to_dict())

        json.dump(people_saving, f, ensure_ascii=False, indent=2)
