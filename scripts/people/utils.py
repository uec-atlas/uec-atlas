from .. import utils
import json
import os

KANJI_VARIANT_TRANSLATION = str.maketrans({
    "廣": "広",
    "髙": "高",
    "邉": "辺",
    "邊": "辺",
    "﨑": "崎",
    "𠮷": "吉",
    "萓": "萱",
})


class CanonicalKey:
    value: frozenset[str]

    def __init__(self, name: str | list[str]):
        if isinstance(name, list):
            name = " ".join(name)
        self.name = name
        self.value = _person_key_set(name)

    def __eq__(self, value):
        if not isinstance(value, CanonicalKey):
            return False
        return self.value == value.value or self.name.replace(" ", "") == value.name.replace(" ", "")

    def __hash__(self):
        return hash(self.value)

    def __repr__(self):
        return f"CanonicalKey({self.value})"


def normalize_name(name: str) -> str:
    if not isinstance(name, str):
        return ""
    name = utils.normalize_string(name)
    name = name.title()
    return name.strip()


def canonicalize_kanji(name: str) -> str:
    return name.translate(KANJI_VARIANT_TRANSLATION)


def _person_key_set(name: str) -> frozenset[str]:
    if not isinstance(name, str):
        return frozenset()
    s = utils.normalize_string(name)
    s = canonicalize_kanji(s)
    s = s.lower()
    s = frozenset(s.split(" "))
    return s


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
        existing_name_keys = [CanonicalKey(r["name"]["ja"])
                              for r in people_saving]
        for person in people:
            if any(name_key == person.canonical_key for name_key in existing_name_keys):
                continue
            people_saving.append(person.to_dict())

        json.dump(people_saving, f, ensure_ascii=False, indent=2)
