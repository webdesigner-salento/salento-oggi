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



TELERAMA_FIXTURE = Path(__file__).parent / "fixtures" / "trnews.xml"
TELERAMA = "TeleRama News"


class TeleRamaFeedTests(unittest.TestCase):
    def setUp(self):
        self.items = parse_feed(TELERAMA_FIXTURE.read_bytes(), TELERAMA)

    def test_parse_feed_telerama(self):
        self.assertEqual(len(self.items), 3)
        first = self.items[0]
        self.assertEqual(first["title"], "Taviano, tre colpi di fucile contro un'abitazione: s'indaga")
        self.assertEqual(first["source"], TELERAMA)
        self.assertEqual(first["published_at"], "2026-10-19T10:56:39+00:00")
        self.assertEqual(first["category_raw"], ["CRONACA", "LECCE"])
        self.assertEqual(first["image"], "https://cdn.trnews.example/stazione-cc-taviano.jpg")

    def test_telerama_empty_description_gives_empty_summary(self):
        self.assertEqual([item["summary"] for item in self.items], ["", "", ""])

    def test_telerama_png_image_is_kept(self):
        self.assertTrue(self.items[2]["image"].endswith(".png"))


IL_POST_FIXTURE = Path(__file__).parent / "fixtures" / "ilpost.xml"
ALTRECONOMIA_FIXTURE = Path(__file__).parent / "fixtures" / "altreconomia.xml"


class NationalFeedTests(unittest.TestCase):
    def setUp(self):
        self.il_post = parse_feed(IL_POST_FIXTURE.read_bytes(), "Il Post")
        self.altreconomia = parse_feed(ALTRECONOMIA_FIXTURE.read_bytes(), "Altreconomia")

    def test_il_post_reads_titles_sources_and_dates(self):
        self.assertEqual(len(self.il_post), 3)
        self.assertEqual(self.il_post[0]["title"], "Ep 348 – Quell'estraneo di mio figlio")
        self.assertEqual(self.il_post[0]["published_at"], "2026-10-20T15:00:07+00:00")
        self.assertEqual({i["source"] for i in self.il_post}, {"Il Post"})

    def test_il_post_empty_description_gives_empty_summary_and_no_image(self):
        first = self.il_post[0]
        self.assertEqual(first["summary"], "")
        self.assertIsNone(first["image"])

    def test_il_post_description_with_only_an_img_gives_the_image_and_no_summary(self):
        second = self.il_post[1]
        self.assertEqual(second["image"], "https://www.ilpost.it/wp-content/uploads/2026/10/caccia-arabia-saudita-1024x683.jpg")
        self.assertEqual(second["summary"], "")

    def test_il_post_summary_skips_the_img_tag_and_reads_the_text(self):
        third = self.il_post[2]
        self.assertEqual(third["image"], "https://www.ilpost.it/wp-content/uploads/2026/10/soldati-citta-1024x683.jpg")
        self.assertEqual(third["summary"], "Concretamente non possono fare granché, ma il governo ne schiererà 500 in più a Milano.")

    def test_altreconomia_full_text_description_is_cut_to_200_with_the_featured_image(self):
        first = self.altreconomia[0]
        self.assertEqual(first["published_at"], "2026-10-21T08:44:06+00:00")
        self.assertEqual(first["image"], "https://www.altreconomia.it/app/uploads/2026/10/porto-armi-1024x683.jpg")
        self.assertEqual(len(first["summary"]), 200)
        self.assertTrue(first["summary"].endswith("…"))
        self.assertTrue(first["summary"].startswith("Testo segnaposto dell'articolo"))
        self.assertNotIn("riproduzione riservata", first["summary"])
        self.assertNotRegex(first["summary"], r"<[^>]+>")

    def test_altreconomia_short_text_keeps_its_words_and_not_the_copyright_line(self):
        for item in self.altreconomia[1:]:
            self.assertTrue(item["image"].startswith("https://www.altreconomia.it/app/uploads/"))
            self.assertTrue(item["summary"].startswith("Testo segnaposto breve."))
            self.assertLessEqual(len(item["summary"]), 200)


if __name__ == "__main__":
    unittest.main()
