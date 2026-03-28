from dataclasses import dataclass

from .. import utils


@dataclass
class Lecture:
    id: str
    name: str
    name_en: str
    year: int
    source_url: str
    courses: list[str]
    instructors: list[str]
    term: str
    periods: list[str]
    credits: int

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": {
                "ja": utils.normalize_string(self.name),
                "en": utils.normalize_string(self.name_en)
            },
            "year": self.year,
            "sourceUrl": self.source_url,
            "courses": self.courses,
            "instructors": sorted(self.instructors),
            "credits": self.credits,
            "term": utils.normalize_string(self.term),
            "periods": [utils.normalize_string(period) for period in self.periods]
        }
