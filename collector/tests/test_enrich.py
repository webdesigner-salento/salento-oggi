import unittest

from collector.enrich import dedupe, detect_zone, map_category


def item(title="Titolo", url="https://example.com/a", published_at="2026-10-13T10:00:00+00:00",
         summary="", category_raw=None, source="Fonte"):
    return {
        "id": url[-12:], "title": title, "summary": summary, "image": None, "url": url,
        "source": source, "category_raw": category_raw or [], "published_at": published_at,
    }


class DedupeTests(unittest.TestCase):
    def test_dedupe_same_url(self):
        a = item(title="Uno", url="https://example.com/a")
        b = item(title="Titolo diverso", url="https://example.com/a")
        self.assertEqual(len(dedupe([a, b])), 1)

    def test_dedupe_title_differs_by_case_punctuation_spaces(self):
        a = item(title="Lecce, Di Francesco perde Ilic", url="https://a.example/1")
        b = item(title="lecce  di francesco perde ilic!", url="https://b.example/2")
        self.assertEqual(len(dedupe([a, b])), 1)

    def test_dedupe_keeps_different_articles(self):
        a = item(title="Notizia uno", url="https://example.com/1")
        b = item(title="Notizia due", url="https://example.com/2")
        self.assertEqual([i["url"] for i in dedupe([a, b])],
                         ["https://example.com/1", "https://example.com/2"])

    def test_dedupe_keeps_most_recent_copy(self):
        old = item(title="Stessa", url="https://a.example/1", published_at="2026-10-13T08:00:00+00:00")
        new = item(title="Stessa", url="https://b.example/2", published_at="2026-10-13T09:00:00+00:00")
        self.assertEqual(dedupe([old, new])[0]["url"], "https://b.example/2")
        self.assertEqual(dedupe([new, old])[0]["url"], "https://b.example/2")

    def test_dedupe_tie_keeps_first(self):
        a = item(title="Stessa", url="https://a.example/1")
        b = item(title="Stessa", url="https://b.example/2")
        self.assertEqual(dedupe([a, b])[0]["url"], "https://a.example/1")

    def test_dedupe_copy_without_date_loses_to_dated_copy(self):
        undated = item(title="Stessa", url="https://a.example/1", published_at=None)
        dated = item(title="Stessa", url="https://b.example/2")
        self.assertEqual(dedupe([undated, dated])[0]["url"], "https://b.example/2")

    def test_dedupe_punctuation_only_titles_are_not_merged(self):
        a = item(title="!!!", url="https://example.com/1")
        b = item(title="???", url="https://example.com/2")
        self.assertEqual(len(dedupe([a, b])), 2)

    def test_dedupe_empty_list(self):
        self.assertEqual(dedupe([]), [])


class DetectZoneTests(unittest.TestCase):
    def test_detect_zone_from_title(self):
        self.assertEqual(detect_zone(item(title="Incendio a Mesagne nella notte")), "Brindisi")

    def test_detect_zone_from_summary(self):
        self.assertEqual(detect_zone(item(title="Incidente stradale", summary="Lo scontro a Manduria ieri sera")), "Taranto")

    def test_detect_zone_from_category_tags(self):
        self.assertEqual(detect_zone(item(title="Incidente stradale", category_raw=["Cronaca", "lecce"])), "Lecce")

    def test_detect_zone_unknown_is_salento(self):
        self.assertEqual(detect_zone(item(title="Maltempo sulla Puglia")), "Salento")

    def test_detect_zone_first_in_title_wins(self):
        self.assertEqual(detect_zone(item(title="Da Taranto a Brindisi in treno")), "Taranto")
        self.assertEqual(detect_zone(item(title="Da Brindisi a Taranto in treno")), "Brindisi")

    def test_detect_zone_title_beats_summary(self):
        self.assertEqual(detect_zone(item(title="Festa a Gallipoli", summary="ospiti da Taranto")), "Lecce")

    def test_detect_zone_ignores_partial_words_and_case(self):
        self.assertEqual(detect_zone(item(title="Salvezza e tarantella nel weekend")), "Salento")
        self.assertEqual(detect_zone(item(title="MESAGNE, nuovo sindaco")), "Brindisi")

    def test_detect_zone_handles_missing_fields(self):
        self.assertEqual(detect_zone({"title": "Qualcosa"}), "Salento")
        self.assertEqual(detect_zone({"title": None, "summary": None, "category_raw": None}), "Salento")

    def test_required_comuni_are_covered(self):
        expected = {
            "Lecce": ["Lecce", "Gallipoli", "Otranto", "Nardò", "Galatina", "Casarano", "Maglie", "Tricase", "Copertino"],
            "Brindisi": ["Brindisi", "Ostuni", "Fasano", "Francavilla Fontana", "Mesagne"],
            "Taranto": ["Taranto", "Manduria", "Grottaglie", "Martina Franca"],
        }
        for zone, comuni in expected.items():
            for comune in comuni:
                with self.subTest(comune=comune):
                    self.assertEqual(detect_zone(item(title=f"Notizia da {comune}")), zone)


class MapCategoryTests(unittest.TestCase):
    def test_map_category_known(self):
        self.assertEqual(map_category(["Cronaca"]), "Cronaca")
        self.assertEqual(map_category(["Spettacoli"]), "Eventi")
        self.assertEqual(map_category(["Sanità"]), "Salute")

    def test_map_category_is_case_insensitive(self):
        self.assertEqual(map_category(["  SPORT "]), "Sport")

    def test_map_category_unknown_is_altro(self):
        self.assertEqual(map_category(["Prima Pagina", "lecce"]), "Altro")

    def test_map_category_empty_list_is_altro(self):
        self.assertEqual(map_category([]), "Altro")

    def test_map_category_priority_cronaca_politica_sport(self):
        self.assertEqual(map_category(["Sport", "Politica", "Cronaca"]), "Cronaca")
        self.assertEqual(map_category(["Sport", "Politica"]), "Politica")
        self.assertEqual(map_category(["Spettacoli", "Sport"]), "Sport")

    def test_map_category_first_recognized_wins_among_others(self):
        self.assertEqual(map_category(["Spettacoli", "Cultura"]), "Eventi")
        self.assertEqual(map_category(["Cultura", "Spettacoli"]), "Cultura")

    def test_map_category_altro_never_beats_real_category(self):
        self.assertEqual(map_category(["Attualità", "Cultura"]), "Cultura")


if __name__ == "__main__":
    unittest.main()
