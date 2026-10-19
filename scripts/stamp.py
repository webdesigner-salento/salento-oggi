"""Prepara la cartella app/ per la pubblicazione: versiona il service worker e imposta l'indirizzo del sito.

Si lancia nel workflow, dopo il salvataggio di news.json e prima del caricamento su Pages:
    SITE_URL=https://utente.github.io/salento-oggi python -m scripts.stamp
Non modifica nulla nel repository: agisce sulla copia di lavoro del job.
"""
import hashlib
import os
import sys
from pathlib import Path

BUILD_PLACEHOLDER = 'const BUILD = "dev";'
SITE_PLACEHOLDER = "__SITE_URL__"
# Le notizie cambiano ogni 30 minuti e il service worker non fa parte della propria versione.
EXCLUDED = {"data", "sw.js"}


def build_id(app_dir: Path) -> str:
    """Impronta (10 caratteri esadecimali) dei file dell'app che il service worker mette in cache."""
    digest = hashlib.sha1()
    for path in sorted(p for p in app_dir.rglob("*") if p.is_file()):
        relative = path.relative_to(app_dir)
        if relative.parts[0] in EXCLUDED:
            continue
        digest.update(relative.as_posix().encode())
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()[:10]


def stamp(app_dir: Path, site_url: str) -> str:
    """Scrive la versione in sw.js e l'indirizzo del sito in index.html. Restituisce la versione."""
    site_url = (site_url or "").strip()
    if not site_url.startswith(("http://", "https://")):
        raise ValueError(f"SITE_URL deve iniziare con http:// o https://, trovato: {site_url!r}")
    site_url = site_url.rstrip("/")

    sw_path = app_dir / "sw.js"
    index_path = app_dir / "index.html"
    sw = sw_path.read_text(encoding="utf-8")
    index = index_path.read_text(encoding="utf-8")
    if sw.count(BUILD_PLACEHOLDER) != 1:
        raise ValueError(f"sw.js deve contenere esattamente una volta {BUILD_PLACEHOLDER}")
    if SITE_PLACEHOLDER not in index:
        raise ValueError(f"index.html non contiene {SITE_PLACEHOLDER}")

    version = build_id(app_dir)  # calcolata prima delle sostituzioni: non dipende da sw.js né da questo indirizzo
    sw_path.write_text(sw.replace(BUILD_PLACEHOLDER, f'const BUILD = "{version}";'), encoding="utf-8")
    index_path.write_text(index.replace(SITE_PLACEHOLDER, site_url), encoding="utf-8")
    return version


def main() -> int:
    site_url = os.environ.get("SITE_URL", "")
    app_dir = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("app")
    version = stamp(app_dir, site_url)
    print(f"service worker versione {version}, sito {site_url}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
