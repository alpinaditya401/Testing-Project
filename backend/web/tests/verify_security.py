from pathlib import Path
import re
import sys
from app_sources import app_js_text

ROOT = Path(__file__).resolve().parents[2]
APP = app_js_text(ROOT / "web/assets/js")
DATABASE = (ROOT / "server/src/Database.php").read_text(encoding="utf-8")
README = (ROOT / "web/README.md").read_text(encoding="utf-8")

errors = []

def check(condition: bool, message: str) -> None:
    if not condition:
        errors.append(message)

check(
    re.search(r"\b(?:const|let|var)\s+[A-Z_]*PASSWORD\s*=\s*['\"]", APP) is None,
    "Browser bundle contains a static password constant",
)
check(
    re.search(r"password_hash\s*\(\s*['\"]", DATABASE) is None,
    "Database seed hashes a password literal from source",
)
check(
    "AQUASMART_SEED_USERNAME" in DATABASE and "AQUASMART_SEED_PASSWORD" in DATABASE,
    "Database seed credentials are not supplied through environment variables",
)
check("id=\"demo-mode-button\"" in APP, "Offline fallback is not an explicit demo-mode action")
check("- Password:" not in README, "README publishes a development password")

if errors:
    print("SECURITY VERIFICATION FAILED")
    for error in errors:
        print(f"- {error}")
    sys.exit(1)

print("SECURITY VERIFICATION PASSED (5 checks)")
