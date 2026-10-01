"""Real report HTTP contracts against an owned ephemeral database.

UTC calendar boundaries; no production server or fixed port is used.
"""
import unittest
from api_integration import HttpTestCase


class ReportFunctionalTests(HttpTestCase):
    def ingest(self, stamp, ph=7, temperature=28, turbidity=20,
               simulation=True, device='AQS-KOLAM-01'):
        status, _, body = self.request('POST', f'/api/devices/{device}/readings', {
            'created_at': stamp, 'ph': ph, 'temperature': temperature,
            'turbidity': turbidity, 'simulation': simulation,
        }, headers={'X-Device-Key': self.device_key})
        self.assertEqual(status, 201, body)

    def report(self, date='2020-01-01', period='day', device='AQS-KOLAM-01'):
        from urllib.parse import urlencode
        return self.request('GET', '/api/reports?' + urlencode({
            'date': date, 'period': period, 'device_id': device,
        }))

    def test_overflow_returns_explicit_json_error_not_empty_success(self):
        self.login()
        self.ingest('2020-01-01T00:00:00Z', turbidity=1e308)
        self.ingest('2020-01-01T12:00:00Z', turbidity=1e308)
        status, headers, body = self.report()
        self.assertEqual(status, 500, body)
        self.assertEqual(headers.get_content_type(), 'application/json')
        self.assertIsInstance(body, dict)
        self.assertEqual(body['error']['code'], 'internal_error')
        self.assertNotIn('groups', body)
        reference = body['error']['message'].split('Referensi: ')[1]
        self.server_log.flush()
        log = (self.tmpdir/'php-server.log').read_text(encoding='utf-8')
        self.assertIn('[aquasmart ' + reference + ']', log)
        self.assertNotIn(self.seed_password, log)
        self.assertNotIn('ReportsRepository.php', body['error']['message'])

    def test_daily_aggregation_and_device_boundary(self):
        self.login()
        self.ingest('2019-12-31T23:59:59Z', ph=1)
        self.ingest('2020-01-01T00:00:00Z', ph=7, temperature=26, turbidity=10)
        self.ingest('2020-01-01T12:00:00Z', ph=9, temperature=28, turbidity=20)
        self.ingest('2020-01-02T00:00:00Z', ph=13)
        self.ingest('2020-01-01T12:00:00Z', ph=2, device='AQS-AQUA-02')
        status, headers, body = self.report()
        self.assertEqual(status, 200, body)
        self.assertIn('no-store', headers.get('Cache-Control', ''))
        self.assertEqual(body['total_samples'], 2)
        self.assertEqual(len(body['groups']), 1)
        row = body['groups'][0]
        self.assertEqual(row['day'], '2020-01-01')
        self.assertEqual(row['cnt'], 2)
        self.assertEqual(row['ph_avg'], 8)
        self.assertEqual(row['temperature_avg'], 27)
        self.assertEqual(row['turbidity_avg'], 15)

    def test_validation_returns_422_not_internal_error(self):
        self.login()
        invalid = [
            '', '2020-02-30', '2026-02-29', '0000-01-01', '2020-1-01',
            'tomorrow', '2020-01-01T00:00:00Z', '2020-01-01 trailing',
        ]
        for date in invalid:
            with self.subTest(date=date):
                status, _, body = self.report(date=date)
                self.assertEqual(status, 422, body)
                self.assertEqual(body['error']['code'], 'validation_error')
        for query in ['date[]=2020-01-01', 'date=2020-01-01&period[]=day',
                      'date=2020-01-01&device_id[]=AQS-KOLAM-01',
                      'date=2020-01-01&period=year&device_id=AQS-KOLAM-01',
                      'date=2020-01-01&device_id=']:
            with self.subTest(query=query):
                status, _, body = self.request('GET', '/api/reports?' + query)
                self.assertEqual(status, 422, body)
                self.assertEqual(body['error']['code'], 'validation_error')

    def test_month_includes_all_days_not_just_last_seven(self):
        self.login()
        for day in range(1, 30):
            self.ingest(f'2020-02-{day:02d}T12:00:00Z')
        self.ingest('2020-01-31T23:59:59Z')
        self.ingest('2020-03-01T00:00:00Z')
        status, _, body = self.report(date='2020-02-17', period='month')
        self.assertEqual(status, 200, body)
        self.assertEqual(body['total_samples'], 29)
        self.assertEqual(len(body['groups']), 29)
        self.assertEqual(body['start_at'], '2020-02-01T00:00:00Z')
        self.assertEqual(body['end_at_exclusive'], '2020-03-01T00:00:00Z')
        self.assertEqual([x['day'] for x in body['groups']], sorted(x['day'] for x in body['groups']))

    def test_week_starts_monday_and_crosses_year_boundary(self):
        self.login()
        for ts in ['2019-12-29T23:59:59Z', '2019-12-30T00:00:00Z',
                   '2020-01-05T23:59:59Z', '2020-01-06T00:00:00Z']:
            self.ingest(ts)
        status, _, body = self.report(date='2020-01-01', period='week')
        self.assertEqual(status, 200, body)
        self.assertEqual(body['total_samples'], 2)
        self.assertEqual(body['start_at'], '2019-12-30T00:00:00Z')
        self.assertEqual(body['end_at_exclusive'], '2020-01-06T00:00:00Z')

    def test_empty_period_is_not_fabricated_data(self):
        self.login()
        status, _, body = self.report(date='2000-01-01')
        self.assertEqual(status, 200, body)
        self.assertEqual(body['groups'], [])
        self.assertEqual(body['total_samples'], 0)

    def test_auth_and_cross_owner_device_isolation(self):
        self.assertEqual(self.report()[0], 401)
        self.login()
        self.ingest('2020-01-01T12:00:00Z')
        self.new_client()
        status, _, user = self.request('POST', '/api/auth/register', {
            'name': 'Other owner', 'contact': 'other@example.test',
            'password': self.seed_password, 'password_confirmation': self.seed_password,
            'serial_number': self.unclaimed_device_serial,
        })
        self.assertEqual(status, 201, user)
        for device in ['AQS-KOLAM-01', 'UNKNOWN']:
            status, _, body = self.report(device=device)
            self.assertEqual(status, 404, body)
            self.assertNotIn('groups', body)
        status, _, own = self.report(device=self.unclaimed_device_serial)
        self.assertEqual(status, 200, own)
        self.assertEqual(own['total_samples'], 0)

    def test_simulation_counts_and_timezone_normalization(self):
        self.login()
        self.ingest('2020-01-01T07:00:00+07:00', simulation=True)
        self.ingest('2020-01-01T12:00:00Z', simulation=False)
        self.ingest('2020-01-02T06:59:59+07:00', simulation=True)
        self.ingest('2020-01-02T07:00:00+07:00', simulation=False)
        status, _, body = self.report()
        self.assertEqual(status, 200, body)
        self.assertEqual(body['timezone'], 'UTC')
        self.assertEqual(body['simulation_samples'], 2)
        self.assertEqual(body['non_simulation_samples'], 1)
        self.assertEqual(body['groups'][0]['simulation_samples'], 2)
        self.assertEqual(body['groups'][0]['non_simulation_samples'], 1)

    def test_viewer_reads_owner_report_then_revocation_removes_access(self):
        owner = self.login()
        self.ingest('2020-01-01T12:00:00Z')
        owner_client = self.client
        status, _, invited = self.request('POST', '/api/invitations',
            {'contact': 'reports-viewer@example.test'},
            headers={'X-CSRF-Token': owner['csrf_token']})
        self.assertEqual(status, 201, invited)
        self.new_client()
        status, _, viewer = self.request('POST', '/api/auth/register', {
            'name': 'Reports viewer', 'contact': 'reports-viewer@example.test',
            'password': self.seed_password, 'password_confirmation': self.seed_password,
        })
        self.assertEqual(status, 201, viewer)
        status, _, accepted = self.request('POST', '/api/invitations/accept',
            {'token': invited['invitation']['token']},
            headers={'X-CSRF-Token': viewer['csrf_token']})
        self.assertEqual(status, 200, accepted)
        viewer_client = self.client
        status, _, body = self.report()
        self.assertEqual(status, 200, body)
        self.assertEqual(body['total_samples'], 1)
        self.client = owner_client
        status, _, body = self.request('DELETE', f"/api/workspace/members/{viewer['user']['id']}",
            headers={'X-CSRF-Token': owner['csrf_token']})
        self.assertEqual(status, 200, body)
        self.client = viewer_client
        self.assertEqual(self.report()[0], 404)

    def test_default_period_and_boundary_validation(self):
        self.login()
        status, _, body = self.request('GET', '/api/reports?date=2020-01-01&device_id=AQS-KOLAM-01')
        self.assertEqual(status, 200, body)
        self.assertEqual(body['period'], 'day')
        for kwargs in [{'date': '9999-12-31'}, {'device': "AQS-KOLAM-01' OR 1=1 --"}]:
            with self.subTest(kwargs=kwargs):
                status, _, body = self.report(**kwargs)
                self.assertEqual(status, 422, body)
                self.assertEqual(body['error']['code'], 'validation_error')


if __name__ == '__main__':
    unittest.main(verbosity=2)
