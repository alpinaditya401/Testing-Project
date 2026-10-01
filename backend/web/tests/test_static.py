from pathlib import Path
from app_sources import app_js_text

ROOT = Path(__file__).resolve().parents[1]


def test_required_files_exist():
    required = [
        ROOT / "index.html",
        ROOT / "assets/css/app.css",
        ROOT / "assets/js/app.js",
        ROOT / "assets/images/logo.svg",
        ROOT / "manifest.webmanifest",
        ROOT / "sw.js",
    ]
    missing = [str(path) for path in required if not path.exists()]
    assert not missing, f"Missing files: {missing}"


def test_brand_and_accessibility_hooks():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    js = app_js_text(ROOT / "assets/js")
    css = (ROOT / "assets/css/app.css").read_text(encoding="utf-8")
    assert "AquaSmart AIoT" in html
    assert 'aria-live="polite"' in html
    assert 'id="demo-mode-button"' in js
    assert "@media (max-width: 760px)" in css
    assert "focus-visible" in css


def test_core_feature_labels_present():
    js = app_js_text(ROOT / "assets/js")
    for text in [
        "Kualitas Air",
        "Kekeruhan",
        "Aerator",
        "Feeder",
        "Jadwal Pakan",
        "Peringatan & Rekomendasi",
        "Ekspor CSV",
    ]:
        assert text in js
