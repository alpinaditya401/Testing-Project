"""Regressions for the 2 Oktober 2026 review: concurrency, clock skew, rate-limit identity, aerator state."""
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from datetime import datetime, timedelta, timezone
import json
import os
import sqlite3
import unittest
import urllib.error
import urllib.request

from api_integration import HttpTestCase

PROXY_SECRET = 'review-proxy-secret-0123456789'


def stamp(moment):
    return moment.strftime('%Y-%m-%dT%H:%M:%SZ')


class HardeningFollowupTests(HttpTestCase):
    @classmethod
    def setUpClass(cls):
        # Several PHP workers, like Apache mod_php in deploy/Dockerfile. The
        # single-process server used elsewhere cannot show lock contention.
        overrides = {'PHP_CLI_SERVER_WORKERS': '4', 'AQUASMART_PROXY_SECRET': PROXY_SECRET}
        previous = {name: os.environ.get(name) for name in overrides}
        os.environ.update(overrides)
        try:
            super().setUpClass()
        finally:
            for name, value in previous.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value

    def reading(self, device, created_at, **extra):
        body = dict(ph=7, temperature=28, turbidity=10, simulation=True, created_at=created_at, **extra)
        return self.request('POST', f'/api/devices/{device}/readings', body, headers={'X-Device-Key': self.device_key})

    def test_concurrent_readings_never_fail_with_database_locked(self):
        self.request('GET', '/api/auth/me')  # create and seed the database before the burst
        base = datetime(2025, 1, 1, tzinfo=timezone.utc)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

        def post(i):
            device = ['AQS-KOLAM-01', 'AQS-AQUA-02'][i % 2]
            body = json.dumps(dict(ph=7, temperature=28, turbidity=10, simulation=True,
                                   created_at=stamp(base + timedelta(seconds=i)))).encode()
            request = urllib.request.Request(f'{self.base_url}/api/devices/{device}/readings', data=body, method='POST',
                                             headers={'Content-Type': 'application/json', 'X-Device-Key': self.device_key})
            try:
                with opener.open(request, timeout=30) as response:
                    return response.status
            except urllib.error.HTTPError as error:
                with error:
                    return error.code

        with ThreadPoolExecutor(12) as pool:
            statuses = list(pool.map(post, range(120)))
        self.assertEqual(statuses.count(201), 120, statuses)

    def test_reading_from_the_future_is_rejected(self):
        now = datetime.now(timezone.utc)
        status, _, payload = self.reading('AQS-KOLAM-01', stamp(now + timedelta(hours=1)))
        self.assertEqual(status, 422, payload)
        self.assertEqual(self.reading('AQS-KOLAM-01', stamp(now + timedelta(seconds=60)))[0], 201)

    def test_device_limit_is_per_device(self):
        base = datetime(2025, 2, 1, tzinfo=timezone.utc)
        for i in range(240):
            self.assertEqual(self.reading('AQS-KOLAM-01', stamp(base + timedelta(seconds=i)))[0], 201)
        self.assertEqual(self.reading('AQS-KOLAM-01', stamp(base + timedelta(seconds=240)))[0], 429)
        self.assertEqual(self.reading('AQS-AQUA-02', stamp(base))[0], 201)

    def test_trusted_proxy_reports_client_ip(self):
        def bad_login(ip, secret=PROXY_SECRET):
            return self.request('POST', '/api/auth/login', {'username': 'nobody', 'password': 'wrong-password'},
                                headers={'X-AquaSmart-Proxy-Secret': secret, 'X-AquaSmart-Client-IP': ip})[0]
        for _ in range(30):
            self.assertEqual(bad_login('203.0.113.7'), 401)
        self.assertEqual(bad_login('203.0.113.7'), 429)
        # Another browser behind the same BFF keeps its own bucket.
        self.assertEqual(bad_login('203.0.113.8'), 401)
        # A wrong secret falls back to the connection address, whose bucket is still empty.
        self.assertEqual(bad_login('203.0.113.7', secret='x' * 30), 401)

    def test_aerator_state_reverts_when_command_times_out(self):
        user = self.login()
        headers = {'X-CSRF-Token': user['csrf_token']}
        devices = {d['id']: d for d in self.request('GET', '/api/devices')[2]['devices']}
        before = devices['AQS-KOLAM-01']['aerator']
        status, _, payload = self.request('POST', '/api/devices/AQS-KOLAM-01/control',
                                          {'actuator': 'aerator', 'value': not before}, headers=headers)
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload['device']['aerator'], not before)
        with closing(sqlite3.connect(self.tmpdir / 'test.sqlite')) as db:
            db.execute('UPDATE actuator_commands SET expires_at=0 WHERE device_id=?', ('AQS-KOLAM-01',))
            db.commit()
        devices = {d['id']: d for d in self.request('GET', '/api/devices')[2]['devices']}
        commands = self.request('GET', '/api/devices/AQS-KOLAM-01/commands')[2]['commands']
        self.assertEqual(commands[0]['status'], 'timeout', commands)
        self.assertEqual(devices['AQS-KOLAM-01']['aerator'], before, commands)


if __name__ == '__main__':
    unittest.main()
