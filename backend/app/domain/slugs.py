"""ЧПУ: транслитерация русских названий в адреса страниц (/catalog/shu-puer/)."""

import re

_TRANSLIT = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
    "з": "z", "и": "i", "й": "i", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
    "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts",
    "ч": "ch", "ш": "sh", "щ": "shch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
    "я": "ya",
}  # fmt: skip

MAX_SLUG_LENGTH = 80
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def slugify(text: str, fallback: str = "item") -> str:
    lowered = text.lower()
    translit = "".join(_TRANSLIT.get(ch, ch) for ch in lowered)
    slug = re.sub(r"[^a-z0-9]+", "-", translit).strip("-")
    if len(slug) > MAX_SLUG_LENGTH:
        slug = slug[:MAX_SLUG_LENGTH].rstrip("-")
    return slug or fallback


def is_valid_slug(slug: str) -> bool:
    return bool(SLUG_RE.match(slug)) and len(slug) <= MAX_SLUG_LENGTH
