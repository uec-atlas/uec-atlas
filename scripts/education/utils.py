import re


def normalize_handbook_name(name: str) -> str:
    """授業科目・科目区分名を正規化する（記号、空白の除去）。"""
    if not isinstance(name, str):
        return ""
    name = re.sub(r"[★☆※\n\r]", "", name)

    roman_map = {
        "VIII": "Ⅷ", "VII": "Ⅶ", "III": "Ⅲ",
        "VI": "Ⅵ", "IV": "Ⅳ", "II": "Ⅱ", "IX": "Ⅸ",
        "V": "Ⅴ", "X": "Ⅹ", "I": "Ⅰ"
    }

    def replace_roman(match):
        text = match.group(0)
        return roman_map.get(text, text)

    name = re.sub(r"(?<![a-zA-Z])[IVX]+(?![a-zA-Z])", replace_roman, name)
    name = re.sub(r"([a-zA-Z])([\u2160-\u216F])", r"\1 \2", name)
    name = re.sub(r"([a-z])([A-Z])", r"\1 \2", name)
    name = name.replace("（", "(").replace("）", ")")
    name = re.sub(r"\s+", " ", name)
    return name.strip()


def get_course_code_suffix(code: str) -> str:
    """科目コードから Suffix（末尾の英小文字1文字）を抽出する。"""
    match = re.search(r"([a-z])$", code)
    return match.group(1) if match else ""


def canonicalize_subject_name(name: str) -> str:
    """比較用にすべてのノイズを除去する (完全な名寄せ用キー)"""
    s = normalize_handbook_name(name)
    s = re.sub(r"\s+", "", s)
    return s.lower()
