import json
import unittest

from collector import pipeline

NATIONAL_FEEDS = {
    "Il Post": "https://www.ilpost.it/feed/",
    "Valigia Blu": "https://www.valigiablu.it/feed/",
    "IrpiMedia": "https://irpimedia.irpi.eu/feed/",
    "Altreconomia": "https://www.altreconomia.it/feed/",
}
LOCAL_SOURCES = ("Corriere Salentino", "TeleRama News")


def load_sources() -> dict:
    return {s["name"]: s for s in json.loads(pipeline.SOURCES_PATH.read_text(encoding="utf-8"))}


class SourcesFileTests(unittest.TestCase):
    def test_the_four_independent_national_outlets_are_enabled_and_marked_national(self):
        sources = load_sources()
        for name, feed in NATIONAL_FEEDS.items():
            self.assertEqual(sources[name]["feed"], feed, name)
            self.assertEqual(sources[name].get("scope"), "national", name)
            self.assertIs(sources[name]["enabled"], True, name)

    def test_local_sources_are_not_marked_national(self):
        sources = load_sources()
        for name in LOCAL_SOURCES:
            self.assertIn(name, sources)
            self.assertNotEqual(sources[name].get("scope"), "national", name)

    def test_every_source_has_a_name_an_https_feed_and_a_known_scope(self):
        for name, source in load_sources().items():
            self.assertTrue(name.strip())
            self.assertTrue(source["feed"].startswith("https://"), name)
            self.assertIsInstance(source["enabled"], bool, name)
            self.assertIn(source.get("scope"), (None, "national"), name)

    def test_source_names_are_unique(self):
        names = [s["name"] for s in json.loads(pipeline.SOURCES_PATH.read_text(encoding="utf-8"))]
        self.assertEqual(len(names), len(set(names)))


if __name__ == "__main__":
    unittest.main()
