"""Deduplica, zona e categoria delle voci normalizzate."""
import json
import re
from datetime import datetime, timezone
from pathlib import Path

FALLBACK_ZONE = "Salento"
NATIONAL_ZONE = "Italia"  # zona delle fonti con "scope": "national", mai dedotta dal testo
FALLBACK_CATEGORY = "Altro"
CATEGORY_PRIORITY = ("Cronaca", "Politica", "Sport")

_DATA_DIR = Path(__file__).parent


def _load_json(name: str) -> dict:
    return json.loads((_DATA_DIR / name).read_text(encoding="utf-8"))


_PLACE_TO_ZONE = {
    place.casefold(): zone for zone, places in _load_json("zones.json").items() for place in places
}
_PLACE_RE = re.compile(
    r"(?<!\w)(?:"
    + "|".join(re.escape(p) for p in sorted(_PLACE_TO_ZONE, key=len, reverse=True))
    + r")(?!\w)",
    re.IGNORECASE,
)
_CATEGORY_MAP = {k.casefold(): v for k, v in _load_json("categories.json").items()}
_EPOCH = datetime.min.replace(tzinfo=timezone.utc)


def _normalize_title(title: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]|_", " ", (title or "").casefold())).strip()


def as_datetime(iso: str | None) -> datetime:
    if not iso:
        return _EPOCH
    try:
        parsed = datetime.fromisoformat(iso)
    except ValueError:
        return _EPOCH
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def dedupe(items: list[dict]) -> list[dict]:
    """Una sola voce per URL o titolo normalizzato: vince la più recente, a parità la prima."""
    kept: list[dict] = []
    index_by_key: dict[str, int] = {}
    for item in items:
        keys = ["url:" + item["url"]]
        title_key = _normalize_title(item.get("title", ""))
        if title_key:
            keys.append("title:" + title_key)
        position = next((index_by_key[k] for k in keys if k in index_by_key), None)
        if position is None:
            position = len(kept)
            kept.append(item)
        elif as_datetime(item.get("published_at")) > as_datetime(kept[position].get("published_at")):
            kept[position] = item
        for key in keys:
            index_by_key.setdefault(key, position)
    return kept


def _first_zone(text: str, *, proper_names_only: bool) -> str | None:
    for match in _PLACE_RE.finditer(text):
        name = match.group(0)
        if proper_names_only and name == name.lower():
            continue  # "un brindisi", "le maglie": parola comune scritta in minuscolo, non il comune
        return _PLACE_TO_ZONE[name.casefold()]
    return None


def detect_zone(item: dict) -> str:
    """Prima zona trovata, cercando nel titolo, poi nell'anteprima, poi nei tag.

    Nel testo un comune conta solo se scritto con almeno una maiuscola; i tag dei feed sono
    normalmente in minuscolo e valgono comunque.
    """
    for text, proper_names_only in (
        (item.get("title"), True),
        (item.get("summary"), True),
        (" ".join(item.get("category_raw") or []), False),
    ):
        zone = _first_zone(text or "", proper_names_only=proper_names_only)
        if zone:
            return zone
    return FALLBACK_ZONE


def map_category(raw: list[str]) -> str:
    recognized = []
    for tag in raw:
        category = _CATEGORY_MAP.get(tag.casefold().strip())
        if category and category != FALLBACK_CATEGORY:
            recognized.append(category)
    for category in CATEGORY_PRIORITY:
        if category in recognized:
            return category
    return recognized[0] if recognized else FALLBACK_CATEGORY
