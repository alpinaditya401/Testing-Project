"""Jembatan PHP ke Layanan AI Flask, diuji dengan server tiruan (tanpa scikit-learn)."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
import threading
import unittest
import uuid

from api_integration import HttpTestCase

AI_KEY = 'bridge-test-key-0123456789'


class StubAi(BaseHTTPRequestHandler):
    requests = []
    issued = set()
    fail = False

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])) or b'{}')
        StubAi.requests.append({'path': self.path, 'key': self.headers.get('X-AquaSmart-AI-Key'), 'body': body})
        if StubAi.fail:
            return self.reply(500, {'error': {'code': 'internal_error', 'message': 'x'}})
        if self.path == '/api/predict':
            rec_id = str(uuid.uuid4())
            StubAi.issued.add(rec_id)
            return self.reply(200, {'recommendation': {'id': rec_id, 'condition': 'normal', 'source': 'aturan',
                                                       'reasons': ['ok'], 'actions': [], 'actuation': False}})
        rec_id = self.path.split('/')[3]
        if rec_id not in StubAi.issued:
            return self.reply(404, {'error': {'code': 'not_found', 'message': 'x'}})
        return self.reply(200, {'feedback': {'recommendation_id': rec_id, **body}})

    def reply(self, status, payload):
        data = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


class AiBridgeTests(HttpTestCase):
    @classmethod
    def setUpClass(cls):
        cls.stub = ThreadingHTTPServer(('127.0.0.1', 0), StubAi)
        threading.Thread(target=cls.stub.serve_forever, daemon=True).start()
        cls.addClassCleanup(cls.stub.shutdown)
        overrides = {'AQUASMART_AI_URL': f'http://127.0.0.1:{cls.stub.server_port}', 'AQUASMART_AI_KEY': AI_KEY}
        previous = {k: os.environ.get(k) for k in overrides}
        os.environ.update(overrides)
        try:
            super().setUpClass()
        finally:
            for k, v in previous.items():
                os.environ.pop(k, None) if v is None else os.environ.__setitem__(k, v)

    def setUp(self):
        super().setUp()
        StubAi.requests.clear()
        StubAi.fail = False

    def test_recommendation_forwards_history_and_workspace_thresholds(self):
        self.login()
        status, _, payload = self.request('GET', '/api/devices/AQS-KOLAM-01/recommendation')
        self.assertEqual(status, 200, payload)
        self.assertEqual(payload['recommendation']['condition'], 'normal')
        self.assertGreaterEqual(payload['input']['readings'], 3)
        sent = StubAi.requests[-1]
        self.assertEqual((sent['path'], sent['key']), ('/api/predict', AI_KEY))
        self.assertEqual(sent['body']['device_id'], 'AQS-KOLAM-01')
        self.assertEqual(set(sent['body']['thresholds']), {'ph_min', 'ph_max', 'temperature_min', 'temperature_max', 'turbidity_max'})
        self.assertEqual(set(sent['body']['readings'][0]), {'time', 'ph', 'temperature', 'turbidity'})

    def test_feedback_only_for_own_recommendation(self):
        user = self.login()
        headers = {'X-CSRF-Token': user['csrf_token']}
        rec_id = self.request('GET', '/api/devices/AQS-KOLAM-01/recommendation')[2]['recommendation']['id']
        url = f'/api/recommendations/{rec_id}/feedback'
        self.assertEqual(self.request('POST', url, {'helpful': True})[0], 403)
        status, _, payload = self.request('POST', url, {'helpful': True, 'note': 'Sesuai'}, headers=headers)
        self.assertEqual(status, 200, payload)
        self.assertEqual(StubAi.requests[-1]['body'], {'helpful': True, 'note': 'Sesuai'})
        self.assertEqual(self.request('POST', url, {'helpful': 'ya'}, headers=headers)[0], 422)
        self.assertEqual(self.request('POST', f'/api/recommendations/{uuid.uuid4()}/feedback', {'helpful': True}, headers=headers)[0], 404)
        self.assertEqual(self.request('POST', '/api/recommendations/not-a-uuid/feedback', {'helpful': True}, headers=headers)[0], 404)
        # Akun workspace lain tidak dapat melihat perangkat maupun memberi umpan balik.
        self.new_client()
        status, _, other = self.request('POST', '/api/auth/register', {'name': 'Lain', 'contact': 'lain-ai@example.test',
                                                                      'password': 'SafePassword123', 'password_confirmation': 'SafePassword123'})
        self.assertEqual(status, 201, other)
        self.assertEqual(self.request('GET', '/api/devices/AQS-KOLAM-01/recommendation')[0], 404)
        self.assertEqual(self.request('POST', url, {'helpful': False}, headers={'X-CSRF-Token': other['csrf_token']})[0], 404)

    def test_ai_errors_are_reported_not_hidden(self):
        self.login()
        StubAi.fail = True
        status, _, payload = self.request('GET', '/api/devices/AQS-KOLAM-01/recommendation')
        self.assertEqual((status, payload['error']['code']), (502, 'ai_error'))


class AiBridgeUnconfiguredTests(HttpTestCase):
    def test_unconfigured_service_is_503(self):
        self.login()
        status, _, payload = self.request('GET', '/api/devices/AQS-KOLAM-01/recommendation')
        self.assertEqual((status, payload['error']['code']), (503, 'ai_unavailable'))


if __name__ == '__main__':
    unittest.main()
