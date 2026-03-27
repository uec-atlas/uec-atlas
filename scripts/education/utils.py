import re

from .. import utils


def normalize_handbook_name(name: str) -> str:
    return utils.normalize_string(name)


def get_course_code_suffix(code: str) -> str:
    """科目コードから Suffix（末尾の英小文字1文字）を抽出する。"""
    match = re.search(r"([a-z])$", code)
    return match.group(1) if match else ""


def canonicalize_subject_name(name: str) -> str:
    """比較用にすべてのノイズを除去する (完全な名寄せ用キー)"""
    s = normalize_handbook_name(name)
    s = re.sub(r"\s+", "", s)
    return s.lower()
