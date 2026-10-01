import json
import os
import sqlite3
from contextlib import closing
from test_workspace import WorkspaceTests


class HardwareApiTests(WorkspaceTests):
    def setUp(self):
        super().setUp()
        user = self.login()
        result = self.request('POST', '/api/devices/AQS-KOLAM-01/key', {},
                              headers={'X-CSRF-Token': user['csrf_token']})
        self.assertEqual(result[0], 200)
        self.device_key = result[2]['device_key']

    @classmethod
    def setUpClass(cls):
        names = ('AQUASMART_HARDWARE_ENABLED', 'AQUASMART_SIMULATOR_ENABLED')
        previous = {name: os.environ.get(name) for name in names}
        try:
            for name in names:
                os.environ[name] = '1'
            super().setUpClass()
        finally:
            for name, value in previous.items():
                if value is None:
                    os.environ.pop(name, None)
                else:
                    os.environ[name] = value

    def telemetry(self):
        return dict(created_at='2026-09-15T08:00:00Z', provenance='device',
                    simulation=False, source_session='esp32-test-session',
                    temperature=27.25, temperature_status='ok',
                    turbidity_adc=2000, turbidity_mv=1500,
                    turbidity_sensor_mv=2500, turbidity_mapping_percent=50,
                    soil_ph_adc=1000, soil_ph_mv=800,
                    ph_sensor='soil_placeholder', calibrated=False)

    def test_explicit_turbidity_divider_accepts_3v3_sketch_and_rejects_mismatches(self):
        path = '/api/devices/AQS-KOLAM-01/telemetry'
        key = {'X-Device-Key': self.device_key}
        body = self.telemetry() | dict(turbidity_divider_ratio=1.0,
                                      turbidity_sensor_mv=1500,
                                      turbidity_mapping_percent=100 * (1 - 1500 / 3300))
        for ratio in (0, -1, 1.1, '1.0', True, 0.6):
            self.assertEqual(self.request('POST', path, body | {'turbidity_divider_ratio': ratio},
                                          headers=key)[0], 422, ratio)
        result = self.request('POST', path, body, headers=key)
        self.assertEqual(result[0], 201, result[2])
        self.assertEqual(result[2]['telemetry']['turbidity_sensor_mv'], 1500)
        self.assertEqual(self.request('POST', path, body, headers=key)[0], 201)

    def test_water_confirmation_requires_explicit_booleans_and_preserves_old_retries(self):
        path = '/api/devices/AQS-KOLAM-01/telemetry'
        key = {'X-Device-Key': self.device_key}
        body = self.telemetry()
        for field in ('water_level_reference_confirmed', 'water_probes_immersed'):
            for value in ('true', 1, None):
                self.assertEqual(self.request('POST', path, body | {field: value}, headers=key)[0], 422)
        response = self.request('POST', path, body, headers=key)
        self.assertEqual(response[0], 201)
        self.assertFalse(response[2]['telemetry']['water_level_reference_confirmed'])
        self.assertFalse(response[2]['telemetry']['water_probes_immersed'])
        with closing(sqlite3.connect(self.tmpdir / 'test.sqlite')) as db:
            payload = json.loads(db.execute('SELECT payload FROM device_telemetry').fetchone()[0])
            for field in ('water_level_reference_confirmed', 'water_probes_immersed'):
                del payload[field]
            db.execute('UPDATE device_telemetry SET payload=?', (json.dumps(payload),))
        self.assertEqual(self.request('POST', path, body, headers=key)[0], 201)
        confirmed = body | {'created_at': '2026-09-15T08:00:10Z',
                            'water_level_reference_confirmed': True, 'water_probes_immersed': True}
        response = self.request('POST', path, confirmed, headers=key)
        self.assertEqual(response[0], 201)
        self.assertTrue(response[2]['telemetry']['water_probes_immersed'])

    def queue(self, actuator='feeder', request_id='hardware-test'):
        user = self.login()
        response = self.request('POST', '/api/devices/AQS-KOLAM-01/hardware-commands',
                                dict(actuator=actuator, value=True,
                                     duration=2 if actuator == 'feeder' else 0,
                                     request_id=request_id),
                                headers={'X-CSRF-Token': user['csrf_token']})
        self.assertEqual(response[0], 201, response[2])
        return response[2]['command']

    def test_telemetry_validation_duplicate_and_provenance(self):
        self.login()
        path = '/api/devices/AQS-KOLAM-01/telemetry'
        key = {'X-Device-Key': self.device_key}
        body = self.telemetry()
        self.assertEqual(self.request('POST', path, body)[0], 401)
        self.assertEqual(self.request('POST', path, body, headers={'X-Device-Key': 'invalid'})[0], 401)
        for delta in ({'turbidity_mv': 3301}, {'soil_ph_adc': 4096},
                      {'turbidity_sensor_mv': 1000}, {'calibrated': True},
                      {'simulation': True}, {'temperature': None},
                      {'created_at': '2026-02-30T08:00:00Z'},
                      {'source_session': '<script>'}, {'turbidity_mapping_percent': 101}):
            self.assertEqual(self.request('POST', path, body | delta, headers=key)[0], 422, delta)
        for _ in range(2):
            result = self.request('POST', path, body, headers=key)
            self.assertEqual(result[0], 201, result[2])
            self.assertFalse(result[2]['hardware_verified'])
        self.assertEqual(self.request('POST', path, body | {'temperature': 28}, headers=key)[0], 409)
        rows = self.request('GET', path)[2]['telemetry']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['provenance'], 'device')
        self.assertEqual(rows[0]['source_session'], body['source_session'])
        with closing(sqlite3.connect(self.tmpdir / 'test.sqlite')) as db:
            self.assertEqual(db.execute('SELECT count(*) FROM device_telemetry').fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT provenance FROM audit_logs WHERE action='telemetry.received'").fetchone()[0], 'device')
        self.new_client()
        self.register(contact='hardware-other@example.com')
        self.assertEqual(self.request('GET', path)[0], 404)

    def test_unverified_sensors_are_null_and_simulation_is_explicit(self):
        self.login()
        body = self.telemetry()
        body.update(temperature=None, temperature_status='unverified', turbidity_adc=None,
                    turbidity_mv=None, turbidity_sensor_mv=None, turbidity_mapping_percent=None,
                    soil_ph_adc=None, soil_ph_mv=None, simulation=True, provenance='simulation')
        result = self.request('POST', '/api/devices/AQS-KOLAM-01/telemetry', body,
                              headers={'X-Device-Key': self.device_key})
        self.assertEqual(result[0], 201, result[2])
        self.assertIsNone(result[2]['telemetry']['temperature'])
        self.assertEqual(result[2]['telemetry']['provenance'], 'simulation')

    def test_tds_and_water_level_are_validated_and_derived_by_the_server(self):
        path = '/api/devices/AQS-KOLAM-01/telemetry'
        key = {'X-Device-Key': self.device_key}
        body = self.telemetry() | dict(tds_adc=1500, tds_mv=1200, water_distance_cm=18.0, tank_height_cm=50)
        for delta in ({'tds_adc': None}, {'tds_mv': None}, {'tds_mv': 3301}, {'tds_adc': 4096},
                      {'tank_height_cm': None}, {'water_distance_cm': None}, {'tank_height_cm': 0},
                      {'water_distance_cm': -1}, {'water_distance_cm': 501}):
            self.assertEqual(self.request('POST', path, body | delta, headers=key)[0], 422, delta)
        # Device-supplied derived values are ignored: 1200 mV on the SEN0244 curve is 445.5 ppm,
        # and 18 cm below the sensor in a 50 cm tank is 64 percent full.
        sent = body | {'tds_ppm_estimate': 9999, 'water_level_percent': 1}
        result = self.request('POST', path, sent, headers=key)
        self.assertEqual(result[0], 201, result[2])
        self.assertEqual(result[2]['telemetry']['tds_ppm_estimate'], 445.5)
        self.assertEqual(result[2]['telemetry']['water_level_percent'], 64)
        above = self.request('POST', path, body | {'created_at': '2026-09-15T08:00:10Z', 'water_distance_cm': 60},
                             headers=key)[2]['telemetry']
        self.assertEqual(above['water_level_percent'], 0)
        rows = self.request('GET', path)[2]['telemetry']
        self.assertEqual([(r['tds_mv'], r['water_distance_cm']) for r in rows], [(1200, 60), (1200, 18)])
        latest = self.request('GET', path + '?limit=1')[2]['telemetry']
        self.assertEqual(len(latest), 1)
        self.assertEqual(latest[0]['water_distance_cm'], 60)
        for limit in ('0', '101', 'wrong', '1.5', '1&limit[]=2'):
            self.assertEqual(self.request('GET', path + '?limit=' + limit)[0], 422)

    def test_rows_stored_before_tds_fields_still_accept_identical_retries(self):
        path = '/api/devices/AQS-KOLAM-01/telemetry'
        key = {'X-Device-Key': self.device_key}
        body = self.telemetry()
        self.assertEqual(self.request('POST', path, body, headers=key)[0], 201)
        with closing(sqlite3.connect(self.tmpdir / 'test.sqlite')) as db:
            payload = json.loads(db.execute('SELECT payload FROM device_telemetry').fetchone()[0])
            for field in ('tds_adc', 'tds_mv', 'tds_ppm_estimate', 'water_distance_cm',
                          'tank_height_cm', 'water_level_percent'):
                del payload[field]
            db.execute('UPDATE device_telemetry SET payload=?', (json.dumps(payload),))
            db.commit()
        self.assertEqual(self.request('POST', path, body, headers=key)[0], 201)
        row = self.request('GET', path)[2]['telemetry'][0]
        self.assertIsNone(row['tds_ppm_estimate'])
        self.assertIsNone(row['water_level_percent'])

    def test_device_delivery_replay_ack_and_channel_isolation(self):
        command = self.queue()
        self.assertFalse(command['simulation'])
        self.assertEqual(command['provenance'], 'device')
        key = {'X-Device-Key': self.device_key}
        path = '/api/device/devices/AQS-KOLAM-01/commands'
        ack = path + '/' + command['id'] + '/ack'
        self.assertEqual(self.request('POST', ack, {'status': 'succeeded'}, headers=key)[0], 409)
        self.assertEqual(self.request('GET', path)[0], 401)
        self.assertEqual(self.request('GET', '/api/simulator/devices/AQS-KOLAM-01/commands', headers=key)[2]['commands'], [])
        first = self.request('GET', path, headers=key)[2]['commands'][0]
        replay = self.request('GET', path, headers=key)[2]['commands'][0]
        self.assertEqual(first, replay)
        self.assertEqual(self.request('POST', ack, {'status': 'invalid'}, headers=key)[0], 422)
        for _ in range(2):
            self.assertEqual(self.request('POST', ack, {'status': 'succeeded'}, headers=key)[0], 200)
        self.assertEqual(self.request('POST', ack, {'status': 'failed'}, headers=key)[0], 409)
        self.assertEqual(self.request('GET', path, headers=key)[2]['commands'], [])

    def test_timeout_and_poll_does_not_mutate_other_device(self):
        command = self.queue()
        key = {'X-Device-Key': self.device_key}
        path = '/api/device/devices/AQS-KOLAM-01/commands'
        with closing(sqlite3.connect(self.tmpdir / 'test.sqlite')) as db:
            db.execute('UPDATE actuator_commands SET expires_at=0 WHERE id=?', (command['id'],))
            # A second owned row supplies an independent device without sharing a key.
            device = db.execute("SELECT id FROM devices WHERE id!='AQS-KOLAM-01' LIMIT 1").fetchone()[0]
            db.execute('INSERT INTO actuator_commands(id,device_id,user_id,actuator,value,duration,request_id,status,simulation,created_at,expires_at) '
                       'SELECT ?,?,user_id,actuator,value,duration,?,status,simulation,created_at,0 FROM actuator_commands WHERE id=?',
                       ('a' * 32, device, 'foreign-expiry', command['id']))
            db.commit()
        self.assertEqual(self.request('GET', path, headers=key)[2]['commands'], [])
        with closing(sqlite3.connect(self.tmpdir / 'test.sqlite')) as db:
            self.assertEqual(db.execute('SELECT status FROM actuator_commands WHERE id=?', ('a' * 32,)).fetchone()[0], 'pending')
        self.assertEqual(self.request('POST', path + '/' + command['id'] + '/ack', {'status': 'timeout'}, headers=key)[0], 200)
        self.assertEqual(self.request('POST', path + '/' + ('a' * 32) + '/ack', {'status': 'succeeded'}, headers=key)[0], 409)
        self.assertEqual(self.request('GET', f'/api/device/devices/{device}/commands', headers=key)[0], 401)


class HardwareDisabledTests(WorkspaceTests):
    @classmethod
    def setUpClass(cls):
        old = os.environ.pop('AQUASMART_HARDWARE_ENABLED', None)
        try:
            super().setUpClass()
        finally:
            if old is not None:
                os.environ['AQUASMART_HARDWARE_ENABLED'] = old

    def test_hardware_queue_disabled_by_default(self):
        user = self.login()
        result = self.request('POST', '/api/devices/AQS-KOLAM-01/hardware-commands',
                              dict(actuator='feeder', value=True, duration=1, request_id='disabled'),
                              headers={'X-CSRF-Token': user['csrf_token']})
        self.assertEqual(result[0], 503)
