"""Repository integration tests: each PHP process uses its own temporary SQLite DB."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class MonitoringTests(unittest.TestCase):
    def test_simulated_breach_does_not_suppress_other_source_alert(self):
        rows = self.php(r'''
reading($pdo, $did, '2026-09-12T10:00:00Z', 6.0, 28, 20, true);
reading($pdo, $did, '2026-09-12T10:01:00Z', 6.0, 28, 20, false);
echo json_encode($pdo->query('SELECT message FROM alerts')->fetchAll());
''')
        self.assertEqual(len(rows), 2)
        self.assertIn('simulasi', rows[0]['message'])
        self.assertIn('kalibrasi belum diverifikasi', rows[1]['message'])

    def php(self, body):
        with tempfile.TemporaryDirectory(prefix="aquasmart-monitoring-") as tmp:
            env = os.environ.copy()
            env.update(AQUASMART_DB_PATH=str(Path(tmp) / "test.sqlite"),
                       AQUASMART_SEED_USERNAME="monitoring_test",
                       AQUASMART_SEED_PASSWORD=secrets.token_urlsafe(24),
                       AQUASMART_APP_ENV="test")
            setup = r'''
require 'server/src/Database.php';
require 'server/src/AuditRepository.php';
require 'server/src/DeviceRepository.php';
if (file_exists('server/src/ObservationRepository.php')) require 'server/src/ObservationRepository.php';
$pdo = Database::connection();
$pdo->exec('DELETE FROM alerts; DELETE FROM sensor_readings; DELETE FROM audit_logs');
$uid = (int)$pdo->query('SELECT id FROM users ORDER BY id LIMIT 1')->fetchColumn();
$did = 'AQS-KOLAM-01';
function reading($pdo, $did, $ts, $ph=7.0, $temp=28.0, $ntu=20.0, $sim=true) {
    return DeviceRepository::ingestReading($pdo, $did, $ph, $temp, $ntu, $sim, $ts);
}
'''
            result = subprocess.run(["php", "-r", setup + body], cwd=ROOT,
                                    env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertTrue(result.stdout.lstrip().startswith(('[', '{')), result.stdout + result.stderr)
            return json.loads(result.stdout)

    def test_breach_creates_rule_alert_with_provenance_and_recommendation(self):
        rows = self.php(r'''
reading($pdo, $did, '2026-09-12T10:00:00Z', 6.0);
echo json_encode($pdo->query('SELECT * FROM alerts')->fetchAll());
''')
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['severity'], 'warning')
        self.assertIn('pH', rows[0]['message'])
        self.assertIn('2026-09-12T10:00:00Z', rows[0]['message'])
        self.assertIn('simulasi', rows[0]['message'])
        self.assertIn('Periksa', rows[0]['message'])
        self.assertEqual(rows[0]['acknowledged'], 0)


    def test_repeated_breach_does_not_spam_but_recovery_rearms(self):
        rows = self.php(r'''
reading($pdo,$did,'2026-09-12T10:00:00Z',6.0);
reading($pdo,$did,'2026-09-12T10:00:01Z',5.9);
reading($pdo,$did,'2026-09-12T10:00:02Z',7.0);
reading($pdo,$did,'2026-09-12T10:00:03Z',6.0);
echo json_encode($pdo->query('SELECT * FROM alerts')->fetchAll());
''')
        self.assertEqual(len(rows), 2)

    def test_identical_retry_is_idempotent_conflict_rejected(self):
        data = self.php(r'''
$a=reading($pdo,$did,'2026-09-12T10:00:00Z',6.0);
$b=reading($pdo,$did,'2026-09-12T10:00:00Z',6.0);
$rejected=false;try {reading($pdo,$did,'2026-09-12T10:00:00Z',9.0);}catch(InvalidArgumentException $e){$rejected=true;}
echo json_encode(['equal'=>$a===$b,'rejected'=>$rejected,'count'=>(int)$pdo->query('SELECT COUNT(*) FROM sensor_readings')->fetchColumn()]);
''')
        self.assertEqual(data, {'equal': True, 'rejected': True, 'count': 1})

    def test_late_reading_does_not_retrigger_live_alert_or_regress_heartbeat(self):
        data = self.php(r'''
reading($pdo,$did,gmdate('Y-m-d\\TH:i:s\\Z'),7.0);
reading($pdo,$did,'2020-01-01T00:00:00Z',6.0);
$rows=DeviceRepository::allForUser($pdo,$uid);
echo json_encode(['online'=>$rows[0]['online'],'alerts'=>(int)$pdo->query('SELECT COUNT(*) FROM alerts')->fetchColumn()]);
''')
        self.assertEqual(data, {'online': True, 'alerts': 0})

    def test_stale_heartbeat_is_offline(self):
        data = self.php(r'''
$pdo->exec("UPDATE devices SET online=1,last_seen='2000-01-01T00:00:00Z'");
echo json_encode(DeviceRepository::allForUser($pdo,$uid));
''')
        self.assertFalse(data[0]['online'])

if __name__ == '__main__':
    unittest.main()
