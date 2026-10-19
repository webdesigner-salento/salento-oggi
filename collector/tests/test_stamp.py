import tempfile
import unittest
from pathlib import Path

from scripts.stamp import build_id, stamp

SW = 'const BUILD = "dev";\nconst CACHE = `salento-shell-${BUILD}`;\n'
INDEX = '<link rel="canonical" href="__SITE_URL__/">\n<meta property="og:image" content="__SITE_URL__/og-image.png">\n'


def make_app(root: Path) -> Path:
    app = root / "app"
    (app / "js").mkdir(parents=True)
    (app / "data").mkdir()
    (app / "sw.js").write_text(SW)
    (app / "index.html").write_text(INDEX)
    (app / "js" / "main.js").write_text("console.log(1)")
    (app / "data" / "news.json").write_text("{}")
    return app


class StampTests(unittest.TestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.app = make_app(Path(self._tmp.name))

    def test_build_id_is_short_hex_and_stable(self):
        first = build_id(self.app)
        self.assertRegex(first, r"^[0-9a-f]{10}$")
        self.assertEqual(first, build_id(self.app))

    def test_build_id_changes_when_a_shell_file_changes(self):
        before = build_id(self.app)
        (self.app / "js" / "main.js").write_text("console.log(2)")
        self.assertNotEqual(before, build_id(self.app))

    def test_build_id_ignores_news_data_and_the_service_worker_itself(self):
        before = build_id(self.app)
        (self.app / "data" / "news.json").write_text('{"items": [1, 2, 3]}')
        (self.app / "sw.js").write_text(SW + "// ritocco")
        self.assertEqual(before, build_id(self.app))

    def test_stamp_replaces_build_and_site_url(self):
        version = stamp(self.app, "https://utente.github.io/salento-oggi/")
        sw = (self.app / "sw.js").read_text()
        self.assertIn(f'const BUILD = "{version}";', sw)
        self.assertNotIn('"dev"', sw)
        index = (self.app / "index.html").read_text()
        self.assertNotIn("__SITE_URL__", index)
        self.assertIn('href="https://utente.github.io/salento-oggi/"', index)
        self.assertIn('content="https://utente.github.io/salento-oggi/og-image.png"', index)

    def test_stamp_version_matches_what_build_id_would_say_before_stamping(self):
        expected = build_id(self.app)
        self.assertEqual(stamp(self.app, "https://x.example"), expected)

    def test_stamp_fails_loudly_when_a_placeholder_is_missing(self):
        (self.app / "sw.js").write_text("// niente da sostituire\n")
        with self.assertRaises(ValueError):
            stamp(self.app, "https://x.example")
        (self.app / "sw.js").write_text(SW)
        (self.app / "index.html").write_text("<html></html>")
        with self.assertRaises(ValueError):
            stamp(self.app, "https://x.example")

    def test_stamp_rejects_empty_or_non_http_site_url(self):
        for url in ["", "   ", "ftp://x.example", "javascript:alert(1)", "utente.github.io"]:
            with self.assertRaises(ValueError, msg=url):
                stamp(self.app, url)
        self.assertIn('"dev"', (self.app / "sw.js").read_text())


if __name__ == "__main__":
    unittest.main()
