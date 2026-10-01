import sys
import unittest
from pathlib import Path
from app_sources import app_js_text

ROOT = Path(__file__).resolve().parents[1]
SW = (ROOT / "sw.js").read_text(encoding="utf-8")
APP = app_js_text(ROOT / "assets/js")
EXPERIENCE = (ROOT / "assets/js/experience.js").read_text(encoding="utf-8")
CSS = (ROOT / "assets/css/app.css").read_text(encoding="utf-8")

errors = []

def check(condition: bool, message: str):
    if not condition:
        errors.append(message)

# Bug 1: Service Worker asset cache missing experience.js
check("'./assets/js/experience.js'" in SW or '"./assets/js/experience.js"' in SW,
      "Bug 1 FAIL: sw.js does not cache ./assets/js/experience.js for offline demo")

# Bug 2: Modal focus trap and return focus to trigger in app.js
check("trigger" in APP and "focusTrap" in APP,
      "Bug 2 FAIL: showModal in app.js does not trap keyboard focus or save trigger element")

# Bug 3: Modal inert/aria-hidden on #app
check("app.setAttribute('aria-hidden'" in APP or "app.setAttribute('inert'" in APP,
      "Bug 3 FAIL: background #app is not marked aria-hidden/inert when modal is open")

# Bug 4: SVG SMIL <animate> motion reduction
check("pauseAnimations" in EXPERIENCE or "smil" in EXPERIENCE or "reducedMotion.matches" in EXPERIENCE and "animate" in EXPERIENCE,
      "Bug 4 FAIL: SVG SMIL <animate> tags are not suppressed when prefers-reduced-motion is active")

# Bug 5: WCAG AA contrast semantic text token or high-contrast status text
check("--clear-water-text" in CSS or "--sediment-text" in CSS,
      "Bug 5 FAIL: app.css does not define high-contrast WCAG AA semantic status text tokens")

class AuditHookTests(unittest.TestCase):
    def test_regression_hooks(self):
        self.assertEqual(errors, [])


if __name__ == '__main__':
    unittest.main()
