"""Real HTTP tests; each class owns its PHP process and disposable database."""
import http.cookiejar
import json
import secrets
import os
from pathlib import Path
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
WEB_ROOT = ROOT / "web"
ROUTER = ROOT / "server" / "router.php"
HOST = "127.0.0.1"
PORT = None
BASE_URL = None


class HttpTestCase(unittest.TestCase):
    """Shared runtime only: no inherited integration test methods.

    Requests use the class URL; module BASE_URL remains compatible with the
    sequential command/CLI tests. Never attach to an existing application.
    """

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        global PORT, BASE_URL
        cls.tmpdir = Path(tempfile.mkdtemp(prefix="aquasmart-api-test-"))
        cls.server = None
        cls.server_log = None
        cls.addClassCleanup(cls._cleanup_runtime)
        cls.seed_username = f"test_{secrets.token_hex(6)}"
        cls.seed_password = secrets.token_urlsafe(24)
        cls.unclaimed_device_serial = f"AQS-{secrets.token_hex(6).upper()}"
        cls.device_key = secrets.token_urlsafe(32)
        # Bind loopback and obtain the integer port before constructing any URL.
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind((HOST, 0))
            cls.port = sock.getsockname()[1]
        cls.base_url = f"http://{HOST}:{cls.port}"
        PORT, BASE_URL = cls.port, cls.base_url
        env = os.environ.copy()
        env.update({
            "AQUASMART_APP_ENV": "test",
            "AQUASMART_DB_PATH": str(cls.tmpdir / "test.sqlite"),
            "AQUASMART_SESSION_SECURE": "0",
            "AQUASMART_SEED_USERNAME": cls.seed_username,
            "AQUASMART_SEED_PASSWORD": cls.seed_password,
            "AQUASMART_UNCLAIMED_DEVICE_SERIAL": cls.unclaimed_device_serial,
            "AQUASMART_DEVICE_KEY": cls.device_key,
        })
        # Preserve caller overrides (especially AQUASMART_SIMULATOR_ENABLED).
        # File logs avoid a full PIPE deadlocking the child; sessions also expire
        # with this runtime instead of polluting the system PHP session folder.
        sessions = cls.tmpdir / "sessions"
        sessions.mkdir()
        cls.server_log = (cls.tmpdir / "php-server.log").open("w+", encoding="utf-8")
        cls.server = subprocess.Popen(
            ["php", "-d", f"session.save_path={sessions}", "-S",
             f"{HOST}:{cls.port}", "-t", str(WEB_ROOT), str(ROUTER)],
            cwd=ROOT, env=env, stdout=cls.server_log,
            stderr=subprocess.STDOUT, text=True,
        )
        probe = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline:
            if cls.server.poll() is not None:
                break
            try:
                with probe.open(f"{cls.base_url}/api/health", timeout=0.5) as response:
                    data = json.load(response)
                    if response.status == 200 and data.get("service") == "aquasmart-api":
                        if cls.server.poll() is None:
                            return
            except urllib.error.HTTPError as error:
                error.close()
            except (OSError, ValueError):
                pass
            time.sleep(0.1)
        cls.server_log.flush()
        cls.server_log.seek(0)
        output = cls.server_log.read()
        raise RuntimeError(f"Own PHP test server did not become ready:\n{output}")

    @classmethod
    def _cleanup_runtime(cls):
        if cls.server is not None:
            if cls.server.poll() is None:
                cls.server.terminate()
            try:
                cls.server.wait(timeout=3)
            except subprocess.TimeoutExpired:
                cls.server.kill()
                cls.server.wait(timeout=3)
            cls.server = None
        if cls.server_log is not None:
            cls.server_log.close()
            cls.server_log = None
        if cls.tmpdir.exists():
            shutil.rmtree(cls.tmpdir)

    @classmethod
    def tearDownClass(cls):
        try:
            cls._cleanup_runtime()
        finally:
            super().tearDownClass()

    def setUp(self):
        super().setUp()
        self.assertIsNone(self.server.poll(), "Own PHP test process exited")
        # Only this class's explicit temporary database is ever reset. The next
        # real HTTP request invokes Database::connection and real migrations.
        for suffix in ("", "-wal", "-shm", "-journal"):
            path = self.tmpdir / f"test.sqlite{suffix}"
            if path.exists():
                path.unlink()
        self.new_client()

    def new_client(self):
        self.client = urllib.request.build_opener(
            urllib.request.ProxyHandler({}),
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()),
        )
        return self.client

    def request(self, method, path, payload=None, headers=None):
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request_headers = {"Accept": "application/json", **(headers or {})}
        if payload is not None:
            request_headers["Content-Type"] = "application/json"
        request = urllib.request.Request(
            f"{self.base_url}{path}", data=body, headers=request_headers, method=method
        )
        try:
            response = self.client.open(request, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read().decode("utf-8")
            try:
                decoded = json.loads(raw) if raw else None
            except json.JSONDecodeError:
                decoded = {"raw": raw}
            return response.status, response.headers, decoded

    def login(self):
        status, _, payload = self.request(
            "POST", "/api/auth/login",
            {"username": self.seed_username, "password": self.seed_password},
        )
        self.assertEqual(status, 200, payload)
        return payload


class ApiIntegrationTests(HttpTestCase):
    def test_health_endpoint_reports_service_status(self):
        status, headers, payload = self.request("GET", "/api/health")
        self.assertEqual(status, 200)
        self.assertEqual(headers.get_content_type(), "application/json")
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["service"], "aquasmart-api")

    def test_login_rejects_invalid_credentials(self):
        status, _, payload = self.request(
            "POST",
            "/api/auth/login",
            {"username": "invalid-user", "password": "invalid-password"},
        )
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"]["code"], "invalid_credentials")
        self.assertNotIn("password", json.dumps(payload).lower())

    def test_register_valid_email_creates_safe_logged_in_user(self):
        password = "SangatAman123!"
        status, headers, payload = self.request(
            "POST",
            "/api/auth/register",
            {
                "name": "Dina Aquas",
                "contact": "Dina.Owner@Example.com",
                "password": password,
                "password_confirmation": password,
            },
        )

        self.assertEqual(status, 201)
        self.assertEqual(headers.get_content_type(), "application/json")
        self.assertEqual(payload["user"]["name"], "Dina Aquas")
        self.assertEqual(payload["user"]["contact"], "dina.owner@example.com")
        # Current contract: registration grants admin ONLY in a new own
        # workspace, never membership/access to the bootstrap owner's devices.
        self.assertEqual(payload["user"]["role"], "admin")
        self.assertIsNone(payload["user"]["workspace_owner_id"])
        status, _, devices = self.request("GET", "/api/devices")
        self.assertEqual(status, 200)
        self.assertEqual(devices["devices"], [])
        status, _, denied = self.request("GET", "/api/devices/AQS-KOLAM-01/readings")
        self.assertEqual(status, 404)
        self.assertGreaterEqual(len(payload["csrf_token"]), 32)
        self.assertNotIn("password", json.dumps(payload).lower())

        status, _, me = self.request("GET", "/api/auth/me")
        self.assertEqual(status, 200)
        self.assertEqual(me["user"], payload["user"])

        connection = sqlite3.connect(self.tmpdir / "test.sqlite")
        try:
            row = connection.execute(
                "SELECT username, contact, password_hash FROM users WHERE id = ?",
                (payload["user"]["id"],),
            ).fetchone()
        finally:
            connection.close()
        self.assertEqual(row[0], payload["user"]["username"])
        self.assertEqual(row[1], "dina.owner@example.com")
        self.assertNotEqual(row[2], password)

        argon2id_available = subprocess.check_output(
            [
                "php",
                "-r",
                'echo defined("PASSWORD_ARGON2ID") ? "1" : "0";',
            ],
            text=True,
        ) == "1"
        if argon2id_available:
            self.assertTrue(row[2].startswith("$argon2id$"))

    def test_register_rejects_short_password(self):
        status, _, payload = self.request(
            "POST",
            "/api/auth/register",
            {
                "name": "Dina Aquas",
                "contact": "dina@example.com",
                "password": "pendek",
                "password_confirmation": "pendek",
            },
        )
        self.assertEqual(status, 422)
        self.assertEqual(payload["error"]["code"], "validation_error")
        self.assertEqual(payload["error"]["message"], "Password minimal 8 karakter.")

    def test_register_rejects_empty_name(self):
        password = "SangatAman123!"
        status, _, payload = self.request(
            "POST",
            "/api/auth/register",
            {
                "name": "   ",
                "contact": "dina@example.com",
                "password": password,
                "password_confirmation": password,
            },
        )
        self.assertEqual(status, 422)
        self.assertEqual(payload["error"]["code"], "validation_error")
        self.assertEqual(payload["error"]["message"], "Isi nama lengkap dulu.")

    def test_register_rejects_invalid_email_or_whatsapp_format(self):
        password = "SangatAman123!"
        status, _, payload = self.request(
            "POST",
            "/api/auth/register",
            {
                "name": "Dina Aquas",
                "contact": "kontak-tidak-valid",
                "password": password,
                "password_confirmation": password,
            },
        )
        self.assertEqual(status, 422)
        self.assertEqual(payload["error"]["code"], "validation_error")
        self.assertEqual(payload["error"]["message"], "Format email atau nomor WA belum sesuai.")

    def test_register_rejects_duplicate_contact_without_leaking_database_details(self):
        password = "SangatAman123!"
        registration = {
            "name": "Dina Aquas",
            "contact": "duplikat@example.com",
            "password": password,
            "password_confirmation": password,
        }
        status, _, _ = self.request("POST", "/api/auth/register", registration)
        self.assertEqual(status, 201)

        status, _, payload = self.request("POST", "/api/auth/register", registration)
        self.assertEqual(status, 409)
        self.assertEqual(payload["error"]["code"], "contact_exists")
        self.assertEqual(payload["error"]["message"], "Email atau nomor WA sudah terdaftar.")
        serialized = json.dumps(payload).lower()
        self.assertNotIn("sqlite", serialized)
        self.assertNotIn("unique constraint", serialized)
        self.assertNotIn("password", serialized)

    def test_register_rejects_mismatched_password_confirmation(self):
        status, _, payload = self.request(
            "POST",
            "/api/auth/register",
            {
                "name": "Dina Aquas",
                "contact": "dina@example.com",
                "password": "SangatAman123!",
                "password_confirmation": "TidakSama123!",
            },
        )
        self.assertEqual(status, 422)
        self.assertEqual(payload["error"]["code"], "validation_error")
        self.assertEqual(payload["error"]["message"], "Password dan konfirmasi belum sama.")

    def test_register_without_serial_has_empty_devices_and_default_thresholds(self):
        password = "SangatAman123!"
        status, _, payload = self.request(
            "POST",
            "/api/auth/register",
            {
                "name": "Raka Pembudidaya",
                "contact": "081234567890",
                "password": password,
                "password_confirmation": password,
                "serial_number": "",
            },
        )
        self.assertEqual(status, 201)
        csrf_token = payload["csrf_token"]
        self.assertGreaterEqual(len(csrf_token), 32)

        status, _, devices = self.request("GET", "/api/devices")
        self.assertEqual(status, 200)
        self.assertEqual(devices["devices"], [])

        status, _, thresholds = self.request("GET", "/api/settings/thresholds")
        self.assertEqual(status, 200)
        self.assertEqual(
            thresholds["thresholds"],
            {
                "ph_min": 6.5,
                "ph_max": 8.5,
                "temperature_min": 25.0,
                "temperature_max": 30.0,
                "turbidity_max": 50.0,
            },
        )

    def test_register_rejects_unknown_serial_and_rolls_back_user(self):
        password = "SangatAman123!"
        status, _, payload = self.request(
            "POST",
            "/api/auth/register",
            {
                "name": "Raka Pembudidaya",
                "contact": "serial.palsu@example.com",
                "password": password,

                "password_confirmation": password,
                "serial_number": "AQS-TIDAK-TERDAFTAR",
            },
        )
        self.assertEqual(status, 422)
        self.assertEqual(payload["error"]["code"], "invalid_device_serial")
        self.assertEqual(payload["error"]["message"], "Serial Number Alat belum terdaftar atau sudah digunakan.")

        connection = sqlite3.connect(self.tmpdir / "test.sqlite")
        try:
            count = connection.execute(
                "SELECT COUNT(*) FROM users WHERE contact = ?",
                ("serial.palsu@example.com",),
            ).fetchone()[0]
        finally:
            connection.close()
        self.assertEqual(count, 0)

    def test_register_with_provisioned_serial_claims_device_for_new_user(self):
        password = "SangatAman123!"
        status, _, _ = self.request(
            "POST",
            "/api/auth/register",
            {
                "name": "Raka Pembudidaya",
                "contact": "raka@example.com",
                "password": password,
                "password_confirmation": password,
                "serial_number": self.unclaimed_device_serial,
            },
        )
        self.assertEqual(status, 201)

        status, _, devices = self.request("GET", "/api/devices")
        self.assertEqual(status, 200)
        self.assertEqual(len(devices["devices"]), 1)
        self.assertEqual(devices["devices"][0]["id"], self.unclaimed_device_serial)
        self.assertEqual(devices["devices"][0]["name"], "Perangkat AquaSmart")

    def test_valid_login_creates_session_and_me_returns_safe_user(self):
        login = self.login()
        self.assertEqual(login["user"]["username"], self.seed_username)
        self.assertGreaterEqual(len(login["csrf_token"]), 32)
        self.assertNotIn("password", json.dumps(login).lower())

        status, _, payload = self.request("GET", "/api/auth/me")
        self.assertEqual(status, 200)
        self.assertEqual(payload["user"]["role"], "admin")
        self.assertNotIn("password", json.dumps(payload).lower())

    def test_logout_destroys_authenticated_session(self):
        login = self.login()
        status, _, payload = self.request(
            "POST", "/api/auth/logout", {}, {"X-CSRF-Token": login["csrf_token"]}
        )
        self.assertEqual(status, 200)
        self.assertTrue(payload["logged_out"])

        status, _, payload = self.request("GET", "/api/auth/me")
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"]["code"], "unauthenticated")

    def test_devices_require_authenticated_session(self):
        status, _, payload = self.request("GET", "/api/devices")
        self.assertEqual(status, 401)
        self.assertEqual(payload["error"]["code"], "unauthenticated")

    def test_authenticated_user_receives_seeded_devices_with_latest_reading(self):
        self.login()
        status, _, payload = self.request("GET", "/api/devices")
        self.assertEqual(status, 200)
        self.assertEqual(len(payload["devices"]), 2)
        first = payload["devices"][0]
        self.assertEqual(first["id"], "AQS-KOLAM-01")
        self.assertEqual(first["name"], "Kolam Lele 1")
        self.assertIsInstance(first["online"], bool)
        self.assertIsInstance(first["aerator"], bool)
        self.assertIn("latest_reading", first)
        self.assertAlmostEqual(first["latest_reading"]["ph"], 7.1, places=1)
        self.assertIn("temperature", first["latest_reading"])
        self.assertIn("turbidity", first["latest_reading"])

    def test_sensor_history_is_ordered_oldest_to_newest_and_limited(self):
        self.login()
        status, _, payload = self.request(
            "GET", "/api/devices/AQS-KOLAM-01/readings?limit=5"
        )
        self.assertEqual(status, 200)
        readings = payload["readings"]
        self.assertEqual(len(readings), 5)
        timestamps = [row["time"] for row in readings]
        self.assertEqual(timestamps, sorted(timestamps))
        self.assertTrue(all(row["simulation"] is True for row in readings))
        self.assertAlmostEqual(readings[-1]["ph"], 7.1, places=1)

    def test_control_mutation_rejects_missing_csrf_token(self):
        self.login()
        status, _, payload = self.request(
            "POST",
            "/api/devices/AQS-KOLAM-01/control",
            {"actuator": "aerator", "value": False},
        )
        self.assertEqual(status, 403)
        self.assertEqual(payload["error"]["code"], "csrf_mismatch")

    def test_control_updates_device_state_and_creates_audit_log(self):
        login = self.login()
        csrf = login["csrf_token"]
        status, _, payload = self.request(
            "POST",
            "/api/devices/AQS-KOLAM-01/control",
            {"actuator": "aerator", "value": False},
            {"X-CSRF-Token": csrf},
        )
        self.assertEqual(status, 200)
        self.assertEqual(payload["device"]["id"], "AQS-KOLAM-01")
        self.assertIs(payload["device"]["aerator"], False)

        status, _, devices = self.request("GET", "/api/devices")
        self.assertEqual(status, 200)
        self.assertIs(devices["devices"][0]["aerator"], False)

        status, _, audit = self.request("GET", "/api/audit-logs?limit=10")
        self.assertEqual(status, 200)
        self.assertEqual(audit["audit_logs"][0]["action"], "actuator.control")
        self.assertEqual(audit["audit_logs"][0]["device_id"], "AQS-KOLAM-01")

    def test_feeding_schedules_return_seeded_device_schedule(self):
        self.login()
        status, _, payload = self.request(
            "GET", "/api/devices/AQS-KOLAM-01/schedules"
        )
        self.assertEqual(status, 200)
        self.assertEqual(len(payload["schedules"]), 2)
        first = payload["schedules"][0]
        self.assertEqual(first["time"], "07:00")
        self.assertEqual(first["duration"], 8)
        self.assertEqual(first["days"], "Setiap hari")
        self.assertIs(first["active"], True)

    def test_schedule_can_be_created_and_deleted_with_audit_trail(self):
        login = self.login()
        headers = {"X-CSRF-Token": login["csrf_token"]}
        status, _, created = self.request(
            "POST",
            "/api/devices/AQS-KOLAM-01/schedules",
            {"time": "12:15", "duration": 6, "days": "Setiap hari"},
            headers,
        )
        self.assertEqual(status, 201)
        schedule = created["schedule"]
        self.assertEqual(schedule["time"], "12:15")
        self.assertEqual(schedule["duration"], 6)

        status, _, listed = self.request(
            "GET", "/api/devices/AQS-KOLAM-01/schedules"
        )
        self.assertEqual(status, 200)
        self.assertIn(schedule["id"], [row["id"] for row in listed["schedules"]])

        status, _, deleted = self.request(
            "DELETE", f"/api/schedules/{schedule['id']}", {}, headers
        )
        self.assertEqual(status, 200)
        self.assertTrue(deleted["deleted"])

        status, _, listed = self.request(
            "GET", "/api/devices/AQS-KOLAM-01/schedules"
        )
        self.assertNotIn(schedule["id"], [row["id"] for row in listed["schedules"]])

        status, _, audit = self.request("GET", "/api/audit-logs?limit=10")
        actions = [row["action"] for row in audit["audit_logs"]]
        self.assertIn("schedule.created", actions)
        self.assertIn("schedule.deleted", actions)

    def test_alerts_return_seeded_unacknowledged_events(self):
        self.login()
        status, _, payload = self.request("GET", "/api/alerts?limit=10")
        self.assertEqual(status, 200)
        self.assertEqual(len(payload["alerts"]), 3)
        self.assertEqual(payload["unacknowledged_count"], 2)
        first = payload["alerts"][0]
        self.assertEqual(first["device_id"], "AQS-KOLAM-01")
        self.assertEqual(first["severity"], "warning")
        self.assertIs(first["acknowledged"], False)
        self.assertIn("message", first)

    def test_alert_can_be_acknowledged_and_is_audited(self):
        login = self.login()
        headers = {"X-CSRF-Token": login["csrf_token"]}
        status, _, before = self.request("GET", "/api/alerts?limit=10")
        target = next(row for row in before["alerts"] if not row["acknowledged"])

        status, _, acknowledged = self.request(
            "PATCH", f"/api/alerts/{target['id']}/acknowledge", {}, headers
        )
        self.assertEqual(status, 200)
        self.assertEqual(acknowledged["alert"]["id"], target["id"])
        self.assertIs(acknowledged["alert"]["acknowledged"], True)

        status, _, after = self.request("GET", "/api/alerts?limit=10")
        self.assertEqual(after["unacknowledged_count"], 1)

        status, _, audit = self.request("GET", "/api/audit-logs?limit=10")
        self.assertEqual(audit["audit_logs"][0]["action"], "alert.acknowledged")
        self.assertEqual(audit["audit_logs"][0]["metadata"]["alert_id"], target["id"])

    def test_thresholds_can_be_read_and_updated_with_audit(self):
        login = self.login()
        headers = {"X-CSRF-Token": login["csrf_token"]}

        status, _, initial = self.request("GET", "/api/settings/thresholds")
        self.assertEqual(status, 200)
        self.assertEqual(initial["thresholds"]["ph_min"], 6.5)
        self.assertEqual(initial["thresholds"]["turbidity_max"], 50.0)

        values = {
            "ph_min": 6.7,
            "ph_max": 8.3,
            "temperature_min": 25.5,
            "temperature_max": 29.5,
            "turbidity_max": 48,
        }
        status, _, updated = self.request(
            "PATCH", "/api/settings/thresholds", values, headers
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated["thresholds"], values)

        status, _, persisted = self.request("GET", "/api/settings/thresholds")
        self.assertEqual(persisted["thresholds"], values)
        status, _, audit = self.request("GET", "/api/audit-logs?limit=5")
        self.assertEqual(audit["audit_logs"][0]["action"], "thresholds.updated")

    def test_profile_update_persists_and_me_returns_new_values(self):
        login = self.login()
        headers = {"X-CSRF-Token": login["csrf_token"]}
        status, _, updated = self.request(
            "PATCH",
            "/api/profile",
            {"name": "Alpin Aqua", "phone": "081234567890"},
            headers,
        )
        self.assertEqual(status, 200)
        self.assertEqual(updated["user"]["name"], "Alpin Aqua")
        self.assertEqual(updated["user"]["phone"], "081234567890")

        status, _, me = self.request("GET", "/api/auth/me")
        self.assertEqual(status, 200)
        self.assertEqual(me["user"]["name"], "Alpin Aqua")
        status, _, audit = self.request("GET", "/api/audit-logs?limit=5")
        self.assertEqual(audit["audit_logs"][0]["action"], "profile.updated")

    def test_device_ingestion_accepts_valid_key_without_browser_session(self):
        payload = {
            "ph": 7.2,
            "temperature": 28.1,
            "turbidity": 12.5,
            "simulation": False,
            "created_at": "2026-01-15T10:20:30Z",
        }
        status, _, response = self.request(
            "POST",
            "/api/devices/AQS-KOLAM-01/readings",
            payload,
            {"X-Device-Key": self.device_key},
        )
        self.assertEqual(status, 201)
        self.assertEqual(response["reading"]["ph"], payload["ph"])
        self.assertEqual(response["reading"]["temperature"], payload["temperature"])
        self.assertEqual(response["reading"]["turbidity"], payload["turbidity"])
        self.assertIs(response["reading"]["simulation"], False)
        self.assertEqual(response["reading"]["time"], payload["created_at"])

    def test_device_ingestion_rejects_missing_or_wrong_key(self):
        payload = {"ph": 7, "temperature": 28, "turbidity": 10}
        for headers in ({}, {"X-Device-Key": "wrong-key"}):
            status, _, response = self.request(
                "POST", "/api/devices/AQS-KOLAM-01/readings", payload, headers
            )
            self.assertEqual(status, 401)
            self.assertEqual(response["error"]["code"], "device_unauthenticated")

    def test_device_ingestion_rejects_invalid_payload_and_unknown_device(self):
        invalid = {"ph": 15, "temperature": 28, "turbidity": -1}
        status, _, response = self.request(
            "POST",
            "/api/devices/AQS-KOLAM-01/readings",
            invalid,
            {"X-Device-Key": self.device_key},

        )
        self.assertEqual(status, 422)
        self.assertEqual(response["error"]["code"], "validation_error")

        status, _, response = self.request(
            "POST",
            "/api/devices/UNKNOWN/readings",
            {"ph": 7, "temperature": 28, "turbidity": 10},
            {"X-Device-Key": self.device_key},
        )
        self.assertEqual(status, 404)
        self.assertEqual(response["error"]["code"], "device_not_found")


if __name__ == "__main__":
    unittest.main(verbosity=2)
