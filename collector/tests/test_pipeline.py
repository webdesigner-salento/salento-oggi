import contextlib
import io
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from email.utils import format_datetime
from pathlib import Path
from unittest import mock

from collector import pipeline
from collector.pipeline import build_news

NOW = datetime(2026, 10, 14, 12, 0, tzinfo=timezone.utc)
SPEC_ITEM_FIELDS = {"id", "title", "summary", "image", "url", "source", "category", "zone", "published_at"}
SRC_A = {"name": "Fonte A", "feed": "https://a.example/feed", "enabled": True}
SRC_B = {"name": "Fonte B", "feed": "https://b.example/feed", "enabled": True}
SRC_NATIONAL = {"name": "Fonte N", "feed": "https://n.example/feed", "enabled": True, "scope": "national"}


def rss(entries):
    """entries: list of (title, url, datetime|None, category)."""
    parts = []
    for title, url, when, category in entries:
        date = f"<pubDate>{format_datetime(when)}</pubDate>" if when else ""
        parts.append(
            f"<item><title>{title}</title><link>{url}</link>{date}"
            f"<category>{category}</category><description>Anteprima di {title}</description></item>"
        )
    return ('<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>'
            + "".join(parts) + "</channel></rss>").encode("utf-8")


def ago(**kwargs):
    return NOW - timedelta(**kwargs)


def make_fetch(feeds):
    def fetch(url):
        value = feeds[url]
        if isinstance(value, Exception):
            raise value
        return value
    return fetch


def prev_item(n, source="Fonte A", when=None):
    return {"id": f"id{n:010d}", "title": f"Vecchia {n}", "summary": "s", "image": None,
            "url": f"https://old.example/{n}", "source": source, "category": "Altro",
            "zone": "Salento", "published_at": (when or ago(hours=5)).isoformat()}


def previous_news(items, statuses=None, updated_at="2026-10-14T09:00:00+00:00"):
    return {"updated_at": updated_at, "items": items,
            "sources_status": statuses or [
                {"source": "Fonte A", "ok": True, "last_ok": updated_at, "error": None},
                {"source": "Fonte B", "ok": True, "last_ok": updated_at, "error": None}]}


class BuildNewsTests(unittest.TestCase):
    def test_builds_schema_and_sorts_desc(self):
        fetch = make_fetch({
            SRC_A["feed"]: rss([("Incendio a Mesagne", "https://a.example/1", ago(hours=3), "Cronaca"),
                                ("Gol del Lecce", "https://a.example/2", ago(hours=1), "Sport")]),
            SRC_B["feed"]: rss([("Mostra a Otranto", "https://b.example/3", ago(hours=2), "Spettacoli")]),
        })
        news = build_news([SRC_A, SRC_B], None, fetch, NOW)
        self.assertEqual(set(news), {"updated_at", "items", "sources_status"})
        self.assertEqual(news["updated_at"], NOW.isoformat())
        self.assertEqual([i["title"] for i in news["items"]],
                         ["Gol del Lecce", "Mostra a Otranto", "Incendio a Mesagne"])
        by_title = {i["title"]: i for i in news["items"]}
        self.assertEqual((by_title["Incendio a Mesagne"]["zone"], by_title["Incendio a Mesagne"]["category"]),
                         ("Brindisi", "Cronaca"))
        self.assertEqual(by_title["Mostra a Otranto"]["category"], "Eventi")
        self.assertEqual(news["sources_status"], [
            {"source": "Fonte A", "ok": True, "last_ok": NOW.isoformat(), "error": None},
            {"source": "Fonte B", "ok": True, "last_ok": NOW.isoformat(), "error": None}])

    def test_output_has_only_spec_fields(self):
        fetch = make_fetch({SRC_A["feed"]: rss([("Titolo", "https://a.example/1", ago(hours=1), "Cronaca")])})
        (item,) = build_news([SRC_A], None, fetch, NOW)["items"]
        self.assertEqual(set(item), SPEC_ITEM_FIELDS)

    def test_failed_source_keeps_previous_items_and_marks_not_ok(self):
        previous = previous_news([prev_item(1, "Fonte A"), prev_item(2, "Fonte B")])
        fetch = make_fetch({
            SRC_A["feed"]: rss([("Nuova di A", "https://a.example/new", ago(hours=1), "Cronaca")]),
            SRC_B["feed"]: OSError("timeout"),
        })
        news = build_news([SRC_A, SRC_B], previous, fetch, NOW)
        titles = {i["title"] for i in news["items"]}
        self.assertIn("Nuova di A", titles)
        self.assertIn("Vecchia 2", titles)
        status = {s["source"]: s for s in news["sources_status"]}
        self.assertTrue(status["Fonte A"]["ok"])
        self.assertIs(status["Fonte B"]["ok"], False)
        self.assertEqual(status["Fonte B"]["last_ok"], "2026-10-14T09:00:00+00:00")
        self.assertIn("timeout", status["Fonte B"]["error"])

    def test_all_sources_fail_keeps_previous_news(self):
        previous = previous_news([prev_item(1, "Fonte A"), prev_item(2, "Fonte B")])
        fetch = make_fetch({SRC_A["feed"]: OSError("down"), SRC_B["feed"]: OSError("down")})
        news = build_news([SRC_A, SRC_B], previous, fetch, NOW)
        self.assertEqual({i["id"] for i in news["items"]}, {i["id"] for i in previous["items"]})
        self.assertEqual(news["updated_at"], previous["updated_at"])
        self.assertTrue(all(s["ok"] is False for s in news["sources_status"]))

    def test_all_sources_fail_without_previous_gives_empty_news(self):
        fetch = make_fetch({SRC_A["feed"]: OSError("down")})
        news = build_news([SRC_A], None, fetch, NOW)
        self.assertEqual(news["items"], [])
        self.assertIsNone(news["updated_at"])
        self.assertIsNone(news["sources_status"][0]["last_ok"])

    def test_previous_items_missing_from_new_feed_are_retained(self):
        previous = previous_news([prev_item(1, "Fonte A", ago(hours=30))])
        fetch = make_fetch({SRC_A["feed"]: rss([("Nuova", "https://a.example/n", ago(hours=1), "Cronaca")])})
        titles = [i["title"] for i in build_news([SRC_A], previous, fetch, NOW)["items"]]
        self.assertEqual(titles, ["Nuova", "Vecchia 1"])

    def test_drops_items_older_than_72h(self):
        fetch = make_fetch({SRC_A["feed"]: rss([
            ("Troppo vecchia", "https://a.example/old", ago(hours=73), "Cronaca"),
            ("Ancora valida", "https://a.example/ok", ago(hours=71), "Cronaca")])})
        titles = [i["title"] for i in build_news([SRC_A], None, fetch, NOW)["items"]]
        self.assertEqual(titles, ["Ancora valida"])

    def test_caps_at_300_items(self):
        entries = [(f"Notizia numero {n}", f"https://a.example/{n}", ago(minutes=n), "Cronaca") for n in range(350)]
        fetch = make_fetch({SRC_A["feed"]: rss(entries)})
        items = build_news([SRC_A], None, fetch, NOW)["items"]
        self.assertEqual(len(items), 300)
        self.assertEqual(items[0]["title"], "Notizia numero 0")
        self.assertEqual(items[-1]["title"], "Notizia numero 299")

    def test_item_without_date_uses_collection_time_and_is_not_bumped_later(self):
        feed = rss([("Senza data", "https://a.example/nodate", None, "Cronaca")])
        first = build_news([SRC_A], None, make_fetch({SRC_A["feed"]: feed}), NOW)
        self.assertEqual(first["items"][0]["published_at"], NOW.isoformat())
        later = NOW + timedelta(hours=1)
        second = build_news([SRC_A], first, make_fetch({SRC_A["feed"]: feed}), later)
        self.assertEqual(second["items"][0]["published_at"], NOW.isoformat())

    def test_future_date_is_clamped_to_now(self):
        fetch = make_fetch({SRC_A["feed"]: rss([("Dal futuro", "https://a.example/f", NOW + timedelta(days=2), "Cronaca")])})
        (item,) = build_news([SRC_A], None, fetch, NOW)["items"]
        self.assertEqual(item["published_at"], NOW.isoformat())

    def test_future_date_does_not_slide_forward_on_later_runs(self):
        feed = rss([("Fuso sbagliato", "https://a.example/tz", NOW + timedelta(hours=11), "Cronaca")])
        fetch = make_fetch({SRC_A["feed"]: feed})
        first = build_news([SRC_A], None, fetch, NOW)
        second = build_news([SRC_A], first, fetch, NOW + timedelta(minutes=30))
        third = build_news([SRC_A], second, fetch, NOW + timedelta(hours=1))
        self.assertEqual(second["items"][0]["published_at"], NOW.isoformat())
        self.assertEqual(third["items"][0]["published_at"], NOW.isoformat())

    def test_future_date_that_has_since_passed_takes_the_real_date(self):
        real = NOW + timedelta(hours=2)
        fetch = make_fetch({SRC_A["feed"]: rss([("Programmata", "https://a.example/p", real, "Cronaca")])})
        first = build_news([SRC_A], None, fetch, NOW)
        later = build_news([SRC_A], first, fetch, NOW + timedelta(hours=3))
        self.assertEqual(first["items"][0]["published_at"], NOW.isoformat())
        self.assertEqual(later["items"][0]["published_at"], real.isoformat())

    def test_national_source_items_get_zone_italia_even_when_the_text_names_a_comune(self):
        fetch = make_fetch({
            SRC_A["feed"]: rss([("Incendio a Mesagne", "https://a.example/1", ago(hours=3), "Cronaca")]),
            SRC_NATIONAL["feed"]: rss([("Corteo a Lecce contro il governo", "https://n.example/1", ago(hours=1), "Politica")]),
        })
        news = build_news([SRC_A, SRC_NATIONAL], None, fetch, NOW)
        by_title = {i["title"]: i for i in news["items"]}
        self.assertEqual(by_title["Corteo a Lecce contro il governo"]["zone"], "Italia")
        self.assertEqual(by_title["Corteo a Lecce contro il governo"]["category"], "Politica")
        self.assertEqual(by_title["Incendio a Mesagne"]["zone"], "Brindisi")

    def test_national_flood_does_not_evict_local_items(self):
        old_local = [prev_item(n, "Fonte A", ago(hours=60)) for n in range(1, 11)]
        national = rss([(f"Nazionale {n}", f"https://n.example/{n}", ago(minutes=n + 1), "Politica") for n in range(400)])
        fetch = make_fetch({
            SRC_A["feed"]: rss([("Gol del Lecce", "https://a.example/new", ago(minutes=1), "Sport")]),
            SRC_NATIONAL["feed"]: national,
        })
        news = build_news([SRC_A, SRC_NATIONAL], previous_news(old_local), fetch, NOW)
        local = [i for i in news["items"] if i["zone"] != "Italia"]
        italia = [i for i in news["items"] if i["zone"] == "Italia"]
        self.assertEqual(len(local), 11)
        self.assertEqual(len(italia), 100)
        titles = {i["title"] for i in italia}
        self.assertIn("Nazionale 0", titles)
        self.assertNotIn("Nazionale 100", titles)
        published = [i["published_at"] for i in news["items"]]
        self.assertEqual(published, sorted(published, reverse=True))

    def test_source_without_scope_is_local(self):
        fetch = make_fetch({SRC_A["feed"]: rss([("Corteo a Lecce", "https://a.example/1", ago(hours=1), "Politica")])})
        (item,) = build_news([SRC_A], None, fetch, NOW)["items"]
        self.assertEqual(item["zone"], "Lecce")

    def test_disabled_source_is_skipped_and_its_items_removed(self):
        disabled_b = dict(SRC_B, enabled=False)
        previous = previous_news([prev_item(1, "Fonte A"), prev_item(2, "Fonte B")])
        calls = []

        def fetch(url):
            calls.append(url)
            return rss([("Nuova", "https://a.example/n", ago(hours=1), "Cronaca")])

        news = build_news([SRC_A, disabled_b], previous, fetch, NOW)
        self.assertEqual(calls, [SRC_A["feed"]])
        self.assertNotIn("Fonte B", {i["source"] for i in news["items"]})
        self.assertEqual([s["source"] for s in news["sources_status"]], ["Fonte A"])

    def test_empty_feed_does_not_crash(self):
        previous = previous_news([prev_item(1, "Fonte A")])
        for body in (rss([]), b"<rss>", b""):
            with self.subTest(body=body):
                news = build_news([SRC_A], previous, make_fetch({SRC_A["feed"]: body}), NOW)
                self.assertEqual([i["title"] for i in news["items"]], ["Vecchia 1"])
                self.assertIs(news["sources_status"][0]["ok"], False)

    def test_same_story_from_two_sources_is_merged(self):
        fetch = make_fetch({
            SRC_A["feed"]: rss([("Gol del Lecce!", "https://a.example/1", ago(hours=2), "Sport")]),
            SRC_B["feed"]: rss([("gol del lecce", "https://b.example/9", ago(hours=1), "Sport")]),
        })
        self.assertEqual(len(build_news([SRC_A, SRC_B], None, fetch, NOW)["items"]), 1)


class MainTests(unittest.TestCase):
    def run_main(self, tmp, previous_text):
        sources = Path(tmp) / "sources.json"
        sources.write_text(json.dumps([SRC_A]), encoding="utf-8")
        news_path = Path(tmp) / "data" / "news.json"
        if previous_text is not None:
            news_path.parent.mkdir(parents=True)
            news_path.write_text(previous_text, encoding="utf-8")
        feed = rss([("Titolo àèì – prova", "https://a.example/1", datetime.now(timezone.utc), "Cronaca")])
        with mock.patch.object(pipeline, "SOURCES_PATH", sources), \
                mock.patch.object(pipeline, "NEWS_PATH", news_path), \
                mock.patch.object(pipeline, "fetch_url", lambda url: feed):
            with contextlib.redirect_stdout(io.StringIO()):
                pipeline.main()
        return json.loads(news_path.read_text(encoding="utf-8"))

    def test_main_creates_news_file_when_missing(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = self.run_main(tmp, None)
        self.assertEqual(data["items"][0]["title"], "Titolo àèì – prova")

    def test_main_tolerates_corrupt_previous_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            data = self.run_main(tmp, "{non e' json")
        self.assertEqual(len(data["items"]), 1)

    def test_main_writes_readable_utf8_not_escaped(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.run_main(tmp, None)
            raw = (Path(tmp) / "data" / "news.json").read_text(encoding="utf-8")
        self.assertIn("àèì", raw)



class TeleRamaSourceTests(unittest.TestCase):
    SRC = {"name": "TeleRama News", "feed": "https://trnews.example/feed/", "enabled": True}
    NOW = datetime(2026, 10, 19, 12, 0, tzinfo=timezone.utc)

    def build(self):
        body = (Path(__file__).parent / "fixtures" / "trnews.xml").read_bytes()
        return build_news([self.SRC], None, make_fetch({self.SRC["feed"]: body}), self.NOW)

    def test_telerama_items_get_zone_and_category_from_uppercase_tags(self):
        by_title = {i["title"].split(",")[0].split(" ")[0]: i for i in self.build()["items"]}
        self.assertEqual(len(by_title), 3)
        self.assertEqual((by_title["Taviano"]["category"], by_title["Taviano"]["zone"]), ("Cronaca", "Lecce"))
        self.assertEqual((by_title["Pescoluse"]["category"], by_title["Pescoluse"]["zone"]), ("Cronaca", "Lecce"))
        self.assertEqual((by_title["Konan"]["category"], by_title["Konan"]["zone"]), ("Sport", "Lecce"))

    def test_telerama_items_without_description_are_kept_with_spec_fields_only(self):
        items = self.build()["items"]
        self.assertEqual(len(items), 3)
        for item in items:
            self.assertEqual(set(item), SPEC_ITEM_FIELDS)
            self.assertEqual(item["summary"], "")


if __name__ == "__main__":
    unittest.main()
