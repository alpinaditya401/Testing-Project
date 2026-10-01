import json
from contextlib import closing
import sqlite3
import subprocess
import socket
import sys
import tempfile
from pathlib import Path
import unittest

APP = Path(__file__).resolve().parents[2]


class LocalSeedTests(unittest.TestCase):
    def test_single_pond_has_two_roles_no_fabricated_readings_and_survives_restart(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / 'single.sqlite'
            with socket.socket() as probe:
                probe.bind(('127.0.0.1', 0))
                port = probe.getsockname()[1]
            command = [sys.executable, 'server/run_local.py', '--single-pond',
                       '--database', str(database), '--port', str(port), '--check']
            first = subprocess.run(command, cwd=APP, capture_output=True, text=True, timeout=20)
            self.assertEqual(first.returncode, 0, first.stderr)
            credentials = Path(directory) / 'credentials.local.txt'
            issued = credentials.read_text(encoding='utf-8')
            accounts = json.loads(issued)
            self.assertEqual(accounts['admin']['username'], 'admin')
            self.assertEqual(accounts['viewer']['username'], 'user')
            self.assertNotEqual(accounts['admin']['password'], accounts['viewer']['password'])
            with closing(sqlite3.connect(database)) as db:
                roles = db.execute('SELECT username,role,workspace_owner_id FROM users ORDER BY id').fetchall()
                self.assertEqual(roles, [('admin', 'admin', None), ('user', 'viewer', 1)])
                self.assertEqual(db.execute('SELECT id,online,last_seen FROM devices').fetchall(),
                                 [('AQS-KOLAM-01', 0, None)])
                self.assertEqual(db.execute('SELECT COUNT(*) FROM sensor_readings').fetchone()[0], 0)
            second = subprocess.run(command, cwd=APP, capture_output=True, text=True, timeout=20)
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertEqual(credentials.read_text(encoding='utf-8'), issued)
            retry = subprocess.run(['php', 'server/seed_single_pond.php', str(database)],
                                   cwd=APP, capture_output=True, text=True)
            self.assertEqual(retry.returncode, 2)

    def test_launcher_starts_http_scheduler_and_stops(self):
        with tempfile.TemporaryDirectory() as directory:
            with socket.socket() as probe:
                probe.bind(('127.0.0.1', 0))
                port = probe.getsockname()[1]
            result = subprocess.run([sys.executable, 'server/run_local.py', '--port', str(port),
                                     '--data-dir', directory, '--check'], cwd=APP,
                                    capture_output=True, text=True, timeout=20)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('LOCAL_SMOKE_OK', result.stdout)
            with socket.socket() as probe:
                probe.settimeout(1)
                self.assertNotEqual(probe.connect_ex(('127.0.0.1', port)), 0)

    def test_launcher_keeps_a_named_database_and_its_device_key(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / 'lokal' / 'aquasmart.sqlite'

            def launch():
                with socket.socket() as probe:
                    probe.bind(('127.0.0.1', 0))
                    port = probe.getsockname()[1]
                return subprocess.run([sys.executable, 'server/run_local.py', '--port', str(port),
                                       '--database', str(database), '--check'], cwd=APP,
                                      capture_output=True, text=True, timeout=20)

            def issued_key():
                with closing(sqlite3.connect(database)) as db:
                    return db.execute("SELECT key_hash FROM device_credentials WHERE device_id='AQS-KOLAM-01'").fetchone()[0]

            first = launch()
            self.assertEqual(first.returncode, 0, first.stderr)
            self.assertIn('Device key AQS-KOLAM-01:', first.stdout)
            key_hash = issued_key()
            second = launch()
            self.assertEqual(second.returncode, 0, second.stderr)
            self.assertIn('LOCAL_SMOKE_OK', second.stdout)
            self.assertNotIn('Device key', second.stdout)
            self.assertEqual(issued_key(), key_hash)

    def test_fresh_seed_is_complete_and_existing_database_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'demo.sqlite'
            command = ['php', 'server/seed_local.php', str(path)]
            run = subprocess.run(command, cwd=APP, capture_output=True, text=True)
            self.assertEqual(run.returncode, 0, run.stderr)
            seed = json.loads(run.stdout)
            self.assertNotEqual(seed['admin']['password'], seed['viewer']['password'])
            with closing(sqlite3.connect(path)) as db:
                self.assertEqual(db.execute('SELECT COUNT(*) FROM users').fetchone()[0], 2)
                self.assertEqual(db.execute('SELECT COUNT(*) FROM devices').fetchone()[0], 6)
                self.assertEqual({r[0] for r in db.execute('SELECT status FROM actuator_commands')},
                                 {'succeeded', 'failed', 'timeout'})
                self.assertEqual(db.execute('SELECT COUNT(*) FROM growth_observations').fetchone()[0], 1)
                self.assertEqual(db.execute('SELECT COUNT(*) FROM sensor_readings WHERE simulation=0').fetchone()[0], 0)
                for table in ('sensor_readings','alerts','actuator_commands','growth_observations','audit_logs'):
                    self.assertEqual(db.execute(f'SELECT DISTINCT provenance FROM {table}').fetchall(), [('seed',)])
            before = path.read_bytes()
            retry = subprocess.run(command, cwd=APP, capture_output=True, text=True)
            self.assertEqual(retry.returncode, 2)
            self.assertEqual(path.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
