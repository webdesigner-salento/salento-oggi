"""Raccoglitore: scarica i feed delle fonti e scrive app/data/news.json."""
import json
import os
import sys
import tempfile
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Callable

from collector.enrich import as_datetime, dedupe, detect_zone, map_category
from collector.normalize import parse_feed

ROOT = Path(__file__).resolve().parent.parent
SOURCES_PATH = ROOT / "collector" / "sources.json"
NEWS_PATH = ROOT / "app" / "data" / "news.json"
USER_AGENT = "SalentoOggi/1.0 (aggregatore di titoli e link da feed RSS pubblici)"
FETCH_TIMEOUT = 20
MAX_FEED_BYTES = 5_000_000
MAX_AGE = timedelta(hours=72)
MAX_ITEMS = 300
ITEM_FIELDS = ("id", "title", "summary", "image", "url", "source", "category", "zone", "published_at")
_REQUIRED_PREVIOUS = ("id", "title", "url", "source", "published_at")


def _is_valid_previous(item) -> bool:
    return isinstance(item, dict) and all(isinstance(item.get(k), str) and item[k] for k in _REQUIRED_PREVIOUS)


def _enrich(item: dict, previous_by_id: dict, now: datetime) -> dict:
    """Voce di parse_feed -> voce pubblica (solo i campi della spec)."""
    published = item["published_at"]
    if published is None:
        published = previous_by_id.get(item["id"], {}).get("published_at") or now.isoformat()
    elif as_datetime(published) > now:
        published = now.isoformat()
    public = dict(item, category=map_category(item["category_raw"]), zone=detect_zone(item),
                  published_at=published)
    return {field: public.get(field) for field in ITEM_FIELDS}


def build_news(sources: list[dict], previous: dict | None, fetch: Callable[[str], bytes],
               now: datetime) -> dict:
    previous = previous or {}
    previous_items = [i for i in previous.get("items", []) if _is_valid_previous(i)]
    previous_by_id = {i["id"]: i for i in previous_items}
    previous_status = {s.get("source"): s for s in previous.get("sources_status", []) if isinstance(s, dict)}
    enabled = [s for s in sources if s.get("enabled", True)]
    now_iso = now.isoformat()

    fresh: list[dict] = []
    statuses: list[dict] = []
    for source in enabled:
        name = source["name"]
        try:
            parsed = parse_feed(fetch(source["feed"]), name)
            if not parsed:
                raise ValueError("feed vuoto o non valido")
            fresh.extend(_enrich(item, previous_by_id, now) for item in parsed)
            statuses.append({"source": name, "ok": True, "last_ok": now_iso, "error": None})
        except Exception as exc:  # una fonte guasta non deve fermare le altre
            statuses.append({"source": name, "ok": False,
                             "last_ok": previous_status.get(name, {}).get("last_ok"),
                             "error": f"{type(exc).__name__}: {exc}"[:200]})

    enabled_names = {s["name"] for s in enabled}
    retained = [{f: i.get(f) for f in ITEM_FIELDS} for i in previous_items if i["source"] in enabled_names]
    cutoff = now - MAX_AGE
    items = [i for i in dedupe(fresh + retained) if as_datetime(i["published_at"]) >= cutoff]
    items.sort(key=lambda i: as_datetime(i["published_at"]), reverse=True)

    updated_at = now_iso if any(s["ok"] for s in statuses) else previous.get("updated_at")
    return {"updated_at": updated_at, "items": items[:MAX_ITEMS], "sources_status": statuses}


def fetch_url(url: str) -> bytes:
    request = urllib.request.Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    })
    with urllib.request.urlopen(request, timeout=FETCH_TIMEOUT) as response:
        return response.read(MAX_FEED_BYTES)


def _load_previous(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _write_atomic(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(data, handle, ensure_ascii=False, indent=1)
            handle.write("\n")
        os.chmod(tmp, 0o644)
        os.replace(tmp, path)
    except BaseException:
        Path(tmp).unlink(missing_ok=True)
        raise


def main() -> None:
    sources = json.loads(SOURCES_PATH.read_text(encoding="utf-8"))
    news = build_news(sources, _load_previous(NEWS_PATH), fetch_url, datetime.now(timezone.utc))
    _write_atomic(NEWS_PATH, news)
    ok = sum(1 for s in news["sources_status"] if s["ok"])
    print(f"{len(news['items'])} notizie; fonti ok: {ok}/{len(news['sources_status'])}")
    for status in news["sources_status"]:
        if not status["ok"]:
            print(f"ATTENZIONE {status['source']}: {status['error']}", file=sys.stderr)


if __name__ == "__main__":
    main()
