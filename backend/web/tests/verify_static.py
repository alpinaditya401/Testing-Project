from pathlib import Path
import json
import sys
from app_sources import app_js_text

ROOT = Path(__file__).resolve().parents[1]
errors = []


def check(condition, message):
    if not condition:
        errors.append(message)


required = [
    ROOT / "index.html",
    ROOT / "assets/css/app.css",
    ROOT / "assets/js/app.js",
    ROOT / "assets/images/logo.svg",
    ROOT / "manifest.webmanifest",
    ROOT / "sw.js",
]
for path in required:
    check(path.exists(), f"Missing file: {path}")

html = (ROOT / "index.html").read_text(encoding="utf-8")
js = app_js_text(ROOT / "assets/js")
css = (ROOT / "assets/css/app.css").read_text(encoding="utf-8")
manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))

check("AquaSmart AIoT" in html, "Brand title is missing")
check('aria-live="polite"' in html, "Polite live region is missing")
check('id="demo-mode-button"' in js, "Explicit offline demo action is missing")
check("Kualitas Air" in js, "Water-quality dashboard is missing")
check("Kekeruhan" in js, "Turbidity feature is missing")
check("Aerator" in js, "Aerator control is missing")
check("Feeder" in js, "Feeder control is missing")
check("Jadwal Pakan" in js, "Feeding schedule is missing")
check("Peringatan & Rekomendasi" in js, "Alert page is missing")
check("Ekspor CSV" in js, "CSV export is missing")
check("@media (max-width: 760px)" in css, "Mobile breakpoint is missing")
check("focus-visible" in css, "Keyboard focus style is missing")
check(manifest.get("display") == "standalone", "PWA standalone mode is missing")
check(manifest.get("start_url") == "./#/home", "PWA start URL is invalid")

if errors:
    print("STATIC VERIFICATION FAILED")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print(f"STATIC VERIFICATION PASSED ({14 + len(required)} checks)")
