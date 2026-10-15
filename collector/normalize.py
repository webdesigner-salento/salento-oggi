"""Parsing dei feed RSS 2.0 in voci normalizzate (solo libreria standard)."""
import hashlib
import html
import re
import xml.etree.ElementTree as ET
from datetime import timezone
from email.utils import parsedate_to_datetime

NS = {
    "content": "http://purl.org/rss/1.0/modules/content/",
    "media": "http://search.yahoo.com/mrss/",
}
SUMMARY_LIMIT = 200
_TAG_RE = re.compile(r"<[^>]+>")
_IMG_RE = re.compile(r"<img\b[^>]*?\ssrc=[\"']([^\"']+)[\"']", re.IGNORECASE)
_MORE_MARKER_RE = re.compile(r"\s*\[(?:…|\.\.\.)\]\s*$")


def make_id(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]


def truncate_summary(text: str, limit: int = SUMMARY_LIMIT) -> str:
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _clean_text(raw: str) -> str:
    text = html.unescape(_TAG_RE.sub(" ", raw))
    return re.sub(r"\s+", " ", text).strip()


def _make_summary(raw: str) -> str:
    text = _clean_text(raw)
    if _MORE_MARKER_RE.search(text):
        text = _MORE_MARKER_RE.sub("", text).rstrip() + "…"
    return truncate_summary(text)


def _child_text(item: ET.Element, tag: str, ns: dict | None = None) -> str:
    node = item.find(tag, ns or {})
    return (node.text or "").strip() if node is not None else ""


def _is_http(url: str) -> bool:
    return url.startswith(("http://", "https://"))


def _extract_image(item: ET.Element, html_blobs: list[str]) -> str | None:
    for tag in ("media:content", "media:thumbnail"):
        for node in item.findall(tag, NS):
            url = (node.get("url") or "").strip()
            if _is_http(url):
                return url
    for node in item.findall("enclosure"):
        url = (node.get("url") or "").strip()
        if (node.get("type") or "").startswith("image/") and _is_http(url):
            return url
    for blob in html_blobs:
        match = _IMG_RE.search(blob)
        if match and _is_http(match.group(1)):
            return match.group(1)
    return None


def _parse_date(raw: str) -> str | None:
    if not raw:
        return None
    try:
        parsed = parsedate_to_datetime(raw)
    except (TypeError, ValueError, IndexError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.isoformat()


def parse_feed(xml: bytes, source_name: str) -> list[dict]:
    try:
        root = ET.fromstring(xml)
    except (ET.ParseError, ValueError):
        return []
    items = []
    for item in root.iter("item"):
        title = _clean_text(_child_text(item, "title"))
        url = _child_text(item, "link")
        if not title or not _is_http(url):
            continue
        description = _child_text(item, "description")
        encoded = _child_text(item, "content:encoded", NS)
        items.append(
            {
                "id": make_id(url),
                "title": title,
                "summary": _make_summary(description or encoded),
                "image": _extract_image(item, [encoded, description]),
                "url": url,
                "source": source_name,
                "category_raw": [
                    c for c in (_clean_text(n.text or "") for n in item.findall("category")) if c
                ],
                "published_at": _parse_date(_child_text(item, "pubDate")),
            }
        )
    return items
