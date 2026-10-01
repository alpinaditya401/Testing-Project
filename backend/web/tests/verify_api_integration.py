from pathlib import Path
import sys
from app_sources import app_js_text

ROOT = Path(__file__).resolve().parents[1]
APP = app_js_text(ROOT / "assets/js")
SW = (ROOT / "sw.js").read_text(encoding="utf-8")
errors = []


def check(condition, message):
    if not condition:
        errors.append(message)


check("async function apiRequest" in APP, "API request client is missing")
check("/api/auth/login" in APP, "Server-side login endpoint is not used")
check("/api/auth/me" in APP, "Server session restoration is missing")
check("/api/auth/logout" in APP, "Server-side logout endpoint is not used")
check("/api/devices" in APP, "Device synchronization endpoint is not used")
check("X-CSRF-Token" in APP, "CSRF header support is missing")
check("apiMode" in APP, "Explicit API/demo data mode is missing")
check("API lokal" in APP and "Mode demo" in APP, "Connection mode is not visible in the UI")
check(
    "const valid = data.get('username')" not in APP,
    "Login still validates credentials only in the browser",
)
check("request.url" in SW and "/api/" in SW, "Service worker API bypass is missing")
check('style="' not in APP, "Strict CSP is broken by inline style attributes")
check(
    '<option value="Senin - Jumat">Senin–Jumat</option>' in APP,
    "Weekday schedule value does not match the API contract",
)
check("/api/settings/thresholds" in APP, "Threshold settings are not synchronized with the API")
check("/api/profile" in APP, "Profile edits are not persisted through the API")
check("auditLogs.length ? auditLogs.map" in APP, "Reports page does not render server audit logs")
check('class="audit-empty-row"' in APP, "Audit empty row uses CSS class instead of inline style")

if errors:
    print("API INTEGRATION VERIFICATION FAILED")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("API INTEGRATION VERIFICATION PASSED (10 checks)")
