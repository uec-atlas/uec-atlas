
import re
import mojimoji

FULLWIDTH_ASCII_START = 0xFF01
FULLWIDTH_ASCII_END = 0xFF5E

BRACKET_TRANSLATION = str.maketrans({
    "（": "(", "）": ")",
    "【": "(", "】": ")",
    "「": "(", "」": ")",
})

DASH_TRANSLATION = str.maketrans({
    "–": "-",
    "－": "-",
})


def normalize_string(string: str) -> str:
    """記号および空白の正規化"""
    if not isinstance(string, str):
        return ""
    string = mojimoji.han_to_zen(mojimoji.zen_to_han(
        string, kana=False), digit=False, ascii=False)
    string = string.translate(BRACKET_TRANSLATION).translate(DASH_TRANSLATION)
    string = re.sub(r"[★☆※\n\r]", "", string)

    roman_map = {
        "VIII": "Ⅷ", "VII": "Ⅶ", "III": "Ⅲ",
        "VI": "Ⅵ", "IV": "Ⅳ", "II": "Ⅱ", "IX": "Ⅸ",
        "V": "Ⅴ", "X": "Ⅹ", "I": "Ⅰ"
    }

    def replace_roman(match):
        text = match.group(0)
        return roman_map.get(text, text)

    string = re.sub(
        r"(?<![a-zA-Z0-9])[IVX]+(?![a-zA-Z0-9]|エリア)", replace_roman, string)
    string = re.sub(r"([a-zA-Z])([\u2160-\u216F])", r"\1 \2", string)
    string = re.sub(r"([a-z])([A-Z])", r"\1 \2", string)
    string = re.sub(r"\s+", " ", string)
    return string.strip()
