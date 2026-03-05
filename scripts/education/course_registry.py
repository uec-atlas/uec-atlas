import os
import json
from dataclasses import dataclass, field
from .utils import get_course_code_suffix, canonicalize_subject_name, normalize_handbook_name
from ..gen_id import generate_id


@dataclass
class CodeMapping:
    code: str
    years: list[int]

    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "years": sorted(list(set(self.years)))
        }


@dataclass
class Course:
    id: str
    name: str
    credits: int
    code_mappings: list[CodeMapping] = field(default_factory=list)

    @property
    def identity_key(self) -> tuple[str, int, str]:
        """名寄せ用の複合キーを生成する (正規化名, 単位数, Suffix)。"""
        suffix = get_course_code_suffix(
            self.code_mappings[0].code) if self.code_mappings else ""
        return (canonicalize_subject_name(self.name), self.credits, suffix)

    def to_dict(self) -> dict:
        """JSON-LD 用の辞書（camelCase）に変換する。"""
        return {
            "id": self.id,
            "name": {
                "ja": self.name
            },
            "credits": self.credits,
            "codeMappings": [m.to_dict() for m in self.code_mappings]
        }


class CourseRegistry:
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.courses: list[Course] = []
        self._course_by_code: dict[tuple[int, str], Course] = {}
        self._course_by_identity: dict[tuple[str, int, str], Course] = {}
        self.load()

    def _register_to_cache(self, course: Course):
        """内部キャッシュに登録するヘルパーメソッド"""
        self._course_by_identity[course.identity_key] = course
        for mapping in course.code_mappings:
            for year in mapping.years:
                self._course_by_code[(year, mapping.code)] = course

    def load(self):
        if not os.path.exists(self.file_path):
            return

        with open(self.file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            for entry in data.get("entries", []):
                course = Course(
                    id=entry["id"],
                    name=entry["name"]["ja"],
                    credits=entry["credits"],
                    code_mappings=[CodeMapping(**m)
                                   for m in entry.get("codeMappings", [])]
                )
                self.courses.append(course)
                self._register_to_cache(course)

    def save(self):
        output = {
            "type": "CourseCollection",
            "entries": sorted([c.to_dict() for c in self.courses], key=lambda x: x["name"]["ja"])
        }

        with open(self.file_path, "w", encoding="utf-8") as f:
            json.dump(output, f, indent=2, ensure_ascii=False)

    def upsert_course(self, year: int, code: str, name: str, credits: int):
        target_key = (canonicalize_subject_name(name),
                      credits, get_course_code_suffix(code))
        target_course = self._course_by_identity.get(target_key)

        if target_course:
            mapping = next(
                (m for m in target_course.code_mappings if m.code == code), None)
            if mapping:
                if year not in mapping.years:
                    mapping.years.append(year)
            else:
                target_course.code_mappings.append(
                    CodeMapping(code=code, years=[year]))
        else:
            target_course = Course(
                id=generate_id("uar:education/"),
                name=normalize_handbook_name(name),
                credits=credits,
                code_mappings=[CodeMapping(code=code, years=[year])]
            )
            self.courses.append(target_course)
            self._course_by_identity[target_key] = target_course

        self._course_by_code[(year, code)] = target_course

    def find_course_by_code(self, year: int, code: str) -> Course:
        return self._course_by_code.get((year, code))
