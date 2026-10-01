"""Capture real backend responses for lib/api/fixtures.json, or replay them through the BFF.

    python scripts/capture-api-fixtures.py            # PHP only: rewrite lib/api/fixtures.json
    python scripts/capture-api-fixtures.py --via-bff  # through `next start`: compare, do not write

Both modes seed a throwaway database with server/seed_local.php and call every
browser endpoint in server/API.md as anonymous, admin and viewer. --via-bff needs a
prior `npm run build` and fails when any status, body shape, error body or
forwarded header differs from the committed fixtures, which is how the proxy in
app/api/[...path]/route.ts is checked end to end.

Values the API hands out once (csrf_token, device_key, invitation token) and the
passwords sent are replaced by same-length placeholders before anything is written.
"""
import argparse
import http.cookiejar
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

FRONTEND = Path(__file__).resolve().parents[1]
APP = FRONTEND.parent / "backend"
FIXTURES = FRONTEND / "lib" / "api" / "fixtures.json"
KEPT_HEADERS = ("content-type", "content-disposition", "cache-control", "retry-after",
                "x-export-rows", "x-provenance-counts")
COMPARED_HEADERS = ("content-type", "content-disposition", "cache-control",
                    "x-export-rows", "x-provenance-counts")


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def redact(value, key=""):
    if isinstance(value, dict):
        return {k: redact(v, k) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v, key) for v in value]
    if isinstance(value, str) and key in ("password", "password_confirmation"):
        return "x" * len(value)
    if isinstance(value, str) and key in ("csrf_token", "device_key", "token"):
        return "0" * len(value) if re.fullmatch(r"[0-9a-f]+", value) else "x" * len(value)
    return value


class Client:
    def __init__(self, base):
        self.base = base
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        self.csrf = ""

    def call(self, method, path, body=None, csrf=True, raw_body=None, headers=None):
        data = raw_body if raw_body is not None else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(self.base + path, data=data, method=method)
        if data is not None:
            req.add_header("Content-Type", "application/json")
        for name, value in (headers or {}).items():
            req.add_header(name, value)
        if csrf and method not in ("GET", "HEAD") and self.csrf:
            req.add_header("X-CSRF-Token", self.csrf)
        try:
            with self.opener.open(req, timeout=30) as r:
                status, response_headers, raw = r.status, r.headers, r.read()
        except urllib.error.HTTPError as e:
            status, response_headers, raw = e.code, e.headers, e.read()
        ctype = response_headers.get("Content-Type", "")
        payload = json.loads(raw) if "json" in ctype and raw else raw.decode("utf-8", "replace")
        if isinstance(payload, dict) and isinstance(payload.get("csrf_token"), str):
            self.csrf = payload["csrf_token"]
        kept = {k.lower(): v for k, v in response_headers.items() if k.lower() in KEPT_HEADERS}
        return status, kept, payload


class Recorder:
    def __init__(self):
        self.records = []
        self.unexpected = []

    def __call__(self, name, client, method, path, body=None, expect=None, keep=True, **kw):
        status, headers, payload = client.call(method, path, body, **kw)
        if expect is not None and status != expect:
            self.unexpected.append(f"{name}: expected {expect}, got {status}")
        if keep:
            self.records.append({"name": name, "method": method, "path": path, "status": status,
                                 "request": redact(body), "headers": headers, "body": redact(payload)})
        return status, payload


def wait_for(url):
    for _ in range(150):
        try:
            urllib.request.urlopen(url, timeout=1)
            return
        except OSError:
            time.sleep(0.2)
    raise RuntimeError(f"{url} did not come up")


def walk(record, base, creds):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    anon, admin, viewer, fresh, device = (Client(base) for _ in range(5))

    record("health", anon, "GET", "/api/health", expect=200)
    record("rules", anon, "GET", "/api/rules", expect=200)
    record("err_unauthenticated", anon, "GET", "/api/devices", expect=401)
    record("err_login_invalid", anon, "POST", "/api/auth/login",
           {"username": creds["admin"]["username"], "password": "salah-sekali"}, expect=401)
    record("err_json_malformed", anon, "POST", "/api/auth/login", raw_body=b"{rusak", expect=400)

    record("auth_login", admin, "POST", "/api/auth/login",
           {"username": creds["admin"]["username"], "password": creds["admin"]["password"]}, expect=200)
    record("auth_me", admin, "GET", "/api/auth/me", expect=200)
    record("devices_list", admin, "GET", "/api/devices", expect=200)
    record("device_claim", admin, "POST", "/api/devices", {"serial_number": "AQS-AVAILABLE"}, expect=201)
    record("err_device_claim_taken", admin, "POST", "/api/devices", {"serial_number": "AQS-AVAILABLE"}, expect=409)
    record("err_device_claim_invalid", admin, "POST", "/api/devices", {"serial_number": "!!"}, expect=422)
    record("device_update", admin, "PATCH", "/api/devices/AQS-WARNING",
           {"name": "Kolam uji skema", "location": "Laboratorium lokal"}, expect=200)
    record("device_key_rotate", admin, "POST", "/api/devices/AQS-EMPTY/key", {}, expect=200)
    record("readings", admin, "GET", "/api/devices/AQS-WARNING/readings?limit=5", expect=200)
    record("readings_empty", admin, "GET", "/api/devices/AQS-EMPTY/readings", expect=200)
    record("err_device_foreign", admin, "GET", "/api/devices/AQS-TIDAK-ADA/readings", expect=404)

    record("schedules_empty", admin, "GET", "/api/devices/AQS-KOLAM-01/schedules", expect=200)
    _, created = record("schedule_create", admin, "POST", "/api/devices/AQS-KOLAM-01/schedules",
                        {"time": "07:30", "duration": 5, "days": "Setiap hari"}, expect=201)
    record("schedules_list", admin, "GET", "/api/devices/AQS-KOLAM-01/schedules", expect=200)
    record("err_schedule_invalid", admin, "POST", "/api/devices/AQS-KOLAM-01/schedules",
           {"time": "25:00", "duration": 99, "days": "Kadang"}, expect=422)
    record("schedule_delete", admin, "DELETE", f"/api/schedules/{created['schedule']['id']}", expect=200)

    record("control_feeder", admin, "POST", "/api/devices/AQS-OFFLINE/control",
           {"actuator": "feeder", "value": True, "duration": 3, "request_id": "uji-skema-1"}, expect=200)
    record("control_aerator", admin, "POST", "/api/devices/AQS-WARNING/control",
           {"actuator": "aerator", "value": True}, expect=200)
    record("control_auto", admin, "POST", "/api/devices/AQS-CRITICAL/control",
           {"actuator": "auto", "value": False}, expect=200)
    record("commands", admin, "GET", "/api/devices/AQS-KOLAM-01/commands", expect=200)
    record("feeding_logs", admin, "GET", "/api/devices/AQS-KOLAM-01/feeding-logs", expect=200)
    record("telemetry_empty", admin, "GET", "/api/devices/AQS-KOLAM-01/telemetry", expect=200)

    # Device-side ingestion is not a browser contract; it only gives GET telemetry and
    # the telemetry export something to return. The payloads are the API.md example.
    key = {"X-Device-Key": creds["device_keys"]["AQS-KOLAM-01"]}
    now_z = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    sample = {"created_at": now_z, "provenance": "device", "simulation": False,
              "source_session": "esp32-contoh-001", "temperature": 27.25, "temperature_status": "ok",
              "turbidity_adc": 2000, "turbidity_mv": 1500, "turbidity_sensor_mv": 2500,
              "turbidity_mapping_percent": 50, "soil_ph_adc": 1000, "soil_ph_mv": 800,
              "tds_adc": 1500, "tds_mv": 1200, "water_distance_cm": 18.0, "tank_height_cm": 50,
              "ph_sensor": "soil_placeholder", "calibrated": False}
    disconnected = {**sample, "created_at": "2026-01-01T00:00:00Z", "temperature": None,
                    "temperature_status": "disconnected", "turbidity_adc": None, "turbidity_mv": None,
                    "turbidity_sensor_mv": None, "turbidity_mapping_percent": None,
                    "soil_ph_adc": None, "soil_ph_mv": None, "tds_adc": None, "tds_mv": None,
                    "water_distance_cm": None, "tank_height_cm": None}
    for payload in (sample, disconnected):
        record("ingest", device, "POST", "/api/devices/AQS-KOLAM-01/telemetry", payload,
               csrf=False, headers=key, expect=201, keep=False)
    record("telemetry", admin, "GET", "/api/devices/AQS-KOLAM-01/telemetry", expect=200)
    record("err_hardware_disabled", admin, "POST", "/api/devices/AQS-KOLAM-01/hardware-commands",
           {"actuator": "feeder", "value": True, "duration": 2, "request_id": "uji-hw-1"}, expect=503)

    _, alerts = record("alerts", admin, "GET", "/api/alerts?limit=20", expect=200)
    first_alert = alerts["alerts"][0]["id"]
    record("alert_ack", admin, "PATCH", f"/api/alerts/{first_alert}/acknowledge", {}, expect=200)
    record("alert_ack_again", admin, "PATCH", f"/api/alerts/{first_alert}/acknowledge", {}, expect=200)
    record("audit_logs", admin, "GET", "/api/audit-logs?limit=20", expect=200)

    thresholds = {"ph_min": 6.5, "ph_max": 8.5, "temperature_min": 25, "temperature_max": 30,
                  "turbidity_max": 50}
    record("thresholds", admin, "GET", "/api/settings/thresholds", expect=200)
    record("thresholds_update", admin, "PATCH", "/api/settings/thresholds", thresholds, expect=200)
    record("err_thresholds_invalid", admin, "PATCH", "/api/settings/thresholds",
           {**thresholds, "ph_min": 9, "ph_max": 8}, expect=422)
    record("err_csrf_missing", admin, "PATCH", "/api/settings/thresholds", thresholds,
           csrf=False, expect=403)
    record("profile_update", admin, "PATCH", "/api/profile",
           {"name": "Admin Uji Skema", "phone": "081234567890"}, expect=200)

    record("growth_list", admin, "GET", "/api/growth-observations", expect=200)
    _, observation = record("growth_create", admin, "POST", "/api/growth-observations",
                            {"device_id": "AQS-KOLAM-01", "observed_at": today, "weight_g": 130.5,
                             "length_cm": None, "notes": "Uji skema"}, expect=201)
    record("growth_delete", admin, "DELETE",
           f"/api/growth-observations/{observation['observation']['id']}", expect=200)

    record("rule_versions", admin, "GET", "/api/rule-versions", expect=200)
    for period in ("day", "month"):
        record(f"reports_{period}", admin, "GET",
               f"/api/reports?device_id=AQS-WARNING&date={today}&period={period}", expect=200)
    record("export_json", admin, "GET",
           f"/api/export?device_id=AQS-WARNING&kind=readings&period=day&date={today}&format=json",
           expect=200)
    for kind, device_id in (("alerts", "AQS-WARNING"), ("commands", "AQS-KOLAM-01"),
                            ("feeding_logs", "AQS-KOLAM-01"), ("reports", "AQS-WARNING"),
                            ("telemetry", "AQS-KOLAM-01")):
        record(f"export_json_{kind}", admin, "GET",
               f"/api/export?device_id={device_id}&kind={kind}&period=day&date={today}&format=json",
               expect=200)
    record("export_csv", admin, "GET",
           f"/api/export?device_id=AQS-WARNING&kind=readings&period=day&date={today}&format=csv",
           expect=200)
    record("err_export_kind", admin, "GET",
           f"/api/export?device_id=AQS-WARNING&kind=bogus&period=day&date={today}&format=json",
           expect=422)

    contact = "anggota-skema@example.com"
    _, invitation = record("invitation_create", admin, "POST", "/api/invitations",
                           {"contact": contact}, expect=201)
    record("register", fresh, "POST", "/api/auth/register",
           {"name": "Anggota Skema", "contact": contact, "password": "kata-sandi-uji-skema",
            "password_confirmation": "kata-sandi-uji-skema"}, expect=201)
    record("invitation_accept", fresh, "POST", "/api/invitations/accept",
           {"token": invitation["invitation"]["token"]}, expect=200)
    _, workspace = record("workspace", admin, "GET", "/api/workspace", expect=200)

    record("viewer_login", viewer, "POST", "/api/auth/login",
           {"username": creds["viewer"]["username"], "password": creds["viewer"]["password"]}, expect=200)
    record("viewer_devices", viewer, "GET", "/api/devices", expect=200)
    record("err_viewer_forbidden", viewer, "PATCH", "/api/settings/thresholds", thresholds, expect=403)
    member = next(m for m in workspace["members"] if m["role"] == "viewer")
    record("workspace_member_revoke", admin, "DELETE", f"/api/workspace/members/{member['id']}",
           expect=200)
    record("auth_logout", admin, "POST", "/api/auth/logout", {}, expect=200)
    record("after_logout", admin, "GET", "/api/auth/me", expect=401)


def shape(value):
    if isinstance(value, dict):
        return {k: shape(v) for k, v in sorted(value.items())}
    if isinstance(value, list):
        return [shape(v) for v in value[:1]]
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, (int, float)):
        return "number"
    return type(value).__name__


def compare(committed, replayed):
    by_name = {r["name"]: r for r in replayed}
    problems = []
    for expected in committed:
        actual = by_name.get(expected["name"])
        if actual is None:
            problems.append(f"{expected['name']}: missing")
            continue
        if actual["status"] != expected["status"]:
            problems.append(f"{expected['name']}: status {expected['status']} -> {actual['status']}")
        if shape(actual["body"]) != shape(expected["body"]):
            problems.append(f"{expected['name']}: body shape differs")
        if expected["status"] >= 400 and actual["body"] != expected["body"]:
            problems.append(f"{expected['name']}: error body differs")
        for header in COMPARED_HEADERS:
            if actual["headers"].get(header) != expected["headers"].get(header):
                problems.append(f"{expected['name']}: header {header} differs")
    return problems


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--via-bff", action="store_true", help="replay through next start and compare")
    args = parser.parse_args()

    tmp = Path(tempfile.mkdtemp(prefix="aquasmart-fixtures-"))
    db = tmp / "fixtures.sqlite"
    seed = subprocess.run(["php", "server/seed_local.php", str(db)], cwd=APP,
                          capture_output=True, text=True, check=True)
    creds = json.loads(seed.stdout)
    sessions = tmp / "sessions"
    sessions.mkdir()
    php_base = f"http://127.0.0.1:{free_port()}"
    env = dict(os.environ, AQUASMART_DB_PATH=str(db), AQUASMART_APP_ENV="development",
               AQUASMART_SESSION_SECURE="0")
    processes = [subprocess.Popen(
        ["php", "-d", f"session.save_path={sessions}", "-d", "display_errors=0",
         "-S", php_base.removeprefix("http://"), "-t", "web", "server/router.php"],
        cwd=APP, env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)]
    record = Recorder()
    try:
        wait_for(php_base + "/api/health")
        base = php_base
        if args.via_bff:
            base = f"http://127.0.0.1:{free_port()}"
            processes.append(subprocess.Popen(
                ["node", "node_modules/next/dist/bin/next", "start", "-p", base.rsplit(":", 1)[1]],
                cwd=FRONTEND, env=dict(os.environ, AQUASMART_API_URL=php_base),
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL))
            wait_for(base + "/api/health")
        walk(record, base, creds)
    finally:
        for process in reversed(processes):
            process.terminate()
            process.wait(timeout=10)
        shutil.rmtree(tmp, ignore_errors=True)

    print(f"{len(record.records)} responses captured via {'the BFF' if args.via_bff else 'PHP'}")
    if record.unexpected:
        print("unexpected status codes:\n  " + "\n  ".join(record.unexpected))
        return 1
    records = sorted(record.records, key=lambda r: r["name"])
    if args.via_bff:
        problems = compare(json.loads(FIXTURES.read_text(encoding="utf-8")), records)
        print("identical to lib/api/fixtures.json" if not problems else "\n".join(problems))
        return 1 if problems else 0
    FIXTURES.write_text(json.dumps(records, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {FIXTURES.relative_to(FRONTEND)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
