"""Lock GET /api/rules to the thresholds a new workspace is actually seeded with.

Regression test for the v1 drift: /api/rules published pH 6.0-9.0 while
Auth::register seeded pH 6.5-8.5, so a reading of pH 6.2 was "in range" to any
firmware reading the rule contract but "alert" to the dashboard. ThresholdRules
is now the single source of truth; these tests fail if a second one reappears.
"""
import json
import re
import secrets
import subprocess
import unittest
from pathlib import Path

from api_integration import HttpTestCase

APP = Path(__file__).resolve().parents[1]


class ThresholdContractTests(HttpTestCase):
    def test_published_rules_match_seeded_workspace_defaults(self):
        status, _, rules = self.request("GET", "/api/rules")
        self.assertEqual(status, 200, rules)

        contact = f"threshold_{secrets.token_hex(6)}@example.com"
        password = secrets.token_urlsafe(24)
        status, _, registered = self.request(
            "POST", "/api/auth/register",
            {"name": "Threshold Contract", "contact": contact,
             "password": password, "password_confirmation": password},
        )
        self.assertEqual(status, 201, registered)

        status, _, seeded = self.request("GET", "/api/settings/thresholds")
        self.assertEqual(status, 200, seeded)
        thresholds = seeded["thresholds"]

        self.assertEqual(
            float(rules["rule"]["min"]), float(thresholds["ph_min"]),
            "GET /api/rules pH minimum must equal what a new workspace is seeded with",
        )
        self.assertEqual(
            float(rules["rule"]["max"]), float(thresholds["ph_max"]),
            "GET /api/rules pH maximum must equal what a new workspace is seeded with",
        )

    def test_auth_php_holds_no_threshold_literals_of_its_own(self):
        auth = (APP / "src/Auth.php").read_text(encoding="utf-8")
        start = auth.index("INSERT INTO threshold_settings")
        insert = auth[start:auth.index("');", start)]
        self.assertNotRegex(
            insert, r"VALUES\s*\([^)]*\b\d+\.\d+",
            "threshold_settings defaults must come from ThresholdRules::defaults(), not SQL literals",
        )

    def test_constants_and_hash_are_consistent(self):
        script = (
            "require 'server/src/ThresholdRules.php';"
            "echo json_encode(['v'=>ThresholdRules::VERSION,'h'=>ThresholdRules::getHash(),"
            "'d'=>ThresholdRules::defaults()]);"
        )
        out = subprocess.run(["php", "-r", script], cwd=APP.parent,
                             capture_output=True, text=True, check=True)
        payload = json.loads(out.stdout)
        self.assertRegex(payload["h"], r"^[a-f0-9]{64}$")
        self.assertRegex(payload["v"], r"^threshold-rules-v\d+$")
        self.assertEqual(payload["d"], {
            "ph_min": 6.5, "ph_max": 8.5,
            "temperature_min": 25.0, "temperature_max": 30.0,
            "turbidity_max": 50.0,
        })


if __name__ == "__main__":
    unittest.main()
