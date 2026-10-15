import re
import unittest
from pathlib import Path

from collector.normalize import make_id, parse_feed, truncate_summary

FIXTURE = Path(__file__).parent / "fixtures" / "corriere_salentino.xml"
SOURCE = "Corriere Salentino"


def feed_with_item(item_xml: str) -> bytes:
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" '
        'xmlns:media="http://search.yahoo.com/mrss/"><channel><title>T</title>'
        f"{item_xml}</channel></rss>"
    ).encode("utf-8")


class ParseFeedTests(unittest.TestCase):
    def setUp(self):
        self.items = parse_feed(FIXTURE.read_bytes(), SOURCE)

    def test_parse_feed_extracts_fields(self):
        self.assertEqual(len(self.items), 3)
        first = self.items[0]
        self.assertTrue(first["title"].startswith("Scomparsa Luca Briganti"))
        self.assertEqual(first["source"], SOURCE)
        self.assertRegex(first["url"], r"^https?://")
        self.assertTrue(first["image"])
        self.assertIn("Cronaca", first["category_raw"])
        self.assertEqual(first["published_at"], "2026-10-13T15:03:59+00:00")
        self.assertEqual(
            set(first),
            {"id", "title", "summary", "image", "url", "source", "category_raw", "published_at"},
        )

    def test_summary_is_plain_text_and_max_200(self):
        for item in self.items:
            summary = item["summary"]
            self.assertLessEqual(len(summary), 200)
            self.assertNotRegex(summary, r"<[^>]+>")
            self.assertNotRegex(summary, r"&#?\w+;")
        long_item = next(i for i in self.items if i["title"].startswith("Lupiae"))
        self.assertTrue(long_item["summary"].endswith("…"))

    def test_summary_never_contains_full_content(self):
        first = self.items[0]
        self.assertLessEqual(len(first["summary"]), 200)
        self.assertNotIn("FINE-ARTICOLO-COMPLETO", first["summary"])

    def test_summary_falls_back_to_content_but_stays_limited(self):
        long_text = "parola " * 100
        xml = feed_with_item(
            "<item><title>A</title><link>https://example.com/a</link>"
            f"<content:encoded><![CDATA[<p>{long_text}</p>]]></content:encoded></item>"
        )
        (item,) = parse_feed(xml, "X")
        self.assertLessEqual(len(item["summary"]), 200)
        self.assertTrue(item["summary"].startswith("parola"))

    def test_missing_image_gives_none(self):
        no_image = [i for i in self.items if i["title"].startswith(("Lupiae", "Lecce,"))]
        self.assertEqual(len(no_image), 2)
        for item in no_image:
            self.assertIsNone(item["image"])

    def test_media_content_is_used_for_image(self):
        xml = feed_with_item(
            "<item><title>A</title><link>https://example.com/a</link>"
            '<media:content url="https://example.com/img.jpg" medium="image"/></item>'
        )
        (item,) = parse_feed(xml, "X")
        self.assertEqual(item["image"], "https://example.com/img.jpg")

    def test_missing_or_invalid_date_gives_none(self):
        no_date = feed_with_item("<item><title>A</title><link>https://example.com/a</link></item>")
        bad_date = feed_with_item(
            "<item><title>A</title><link>https://example.com/a</link><pubDate>boh</pubDate></item>"
        )
        self.assertIsNone(parse_feed(no_date, "X")[0]["published_at"])
        self.assertIsNone(parse_feed(bad_date, "X")[0]["published_at"])

    def test_empty_or_malformed_feed_returns_empty_list(self):
        self.assertEqual(parse_feed(b"", SOURCE), [])
        self.assertEqual(parse_feed(b"<rss>", SOURCE), [])

    def test_item_without_link_or_title_is_skipped(self):
        xml = feed_with_item(
            "<item><title>Senza link</title></item>"
            "<item><link>https://example.com/b</link></item>"
            "<item><title>Ok</title><link>https://example.com/c</link></item>"
        )
        items = parse_feed(xml, "X")
        self.assertEqual([i["title"] for i in items], ["Ok"])


class HelperTests(unittest.TestCase):
    def test_make_id_is_stable_and_12_chars(self):
        a = make_id("https://example.com/a")
        self.assertEqual(a, make_id("https://example.com/a"))
        self.assertRegex(a, r"^[0-9a-f]{12}$")
        self.assertNotEqual(a, make_id("https://example.com/b"))

    def test_truncate_summary_short_text_is_unchanged(self):
        self.assertEqual(truncate_summary("ciao mondo"), "ciao mondo")

    def test_truncate_summary_cuts_at_limit_with_ellipsis(self):
        out = truncate_summary("a" * 500, 200)
        self.assertEqual(len(out), 200)
        self.assertTrue(out.endswith("…"))


if __name__ == "__main__":
    unittest.main()
