from contextlib import closing
import importlib.util
import json
from pathlib import Path
import sqlite3
import time
import unittest
from api_integration import HttpTestCase

SPEC = importlib.util.spec_from_file_location('backup_local', Path(__file__).resolve().parents[1]/'backup_local.py')
backup_module = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(backup_module)


class OperabilityTests(HttpTestCase):
    def test_authenticated_api_response_latency_under_two_seconds(self):
        self.login()
        durations = []
        for _ in range(10):
            started = time.perf_counter()
            status, _, _ = self.request('GET','/api/devices')
            durations.append(time.perf_counter()-started)
            self.assertEqual(status,200)
        self.assertLess(max(durations),2)
        print(json.dumps({'local_api_full_response_max_ms':round(max(durations)*1000,2),
                          'samples':len(durations)}))

    def test_old_reading_survives_new_connections_and_consistent_backup(self):
        self.login()
        payload = {'ph':7,'temperature':28,'turbidity':20,'simulation':True,'created_at':'2020-01-01T00:00:00Z'}
        self.assertEqual(self.request('POST','/api/devices/AQS-KOLAM-01/readings',payload,
                                     headers={'X-Device-Key':self.device_key})[0],201)
        destination = self.tmpdir/'backup.sqlite'
        backup_module.backup(self.tmpdir/'test.sqlite',destination)
        with closing(sqlite3.connect(destination)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM sensor_readings WHERE created_at='2020-01-01T00:00:00Z'").fetchone()[0],1)
            self.assertEqual(db.execute('PRAGMA quick_check').fetchone()[0],'ok')
        with self.assertRaises(FileExistsError):
            backup_module.backup(self.tmpdir/'test.sqlite',destination)
        status, _, report = self.request('GET','/api/reports?device_id=AQS-KOLAM-01&date=2020-01-01&period=day')
        self.assertEqual(status,200)
        self.assertEqual(report['total_samples'],1)


if __name__ == '__main__':
    unittest.main(verbosity=2)
