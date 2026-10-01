"""Operations integration tests: PHP CLI + fresh temporary SQLite, never Database::connection.
Run: python -B -m unittest discover -s server/tests -p test_operations.py -v
"""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
PHP = os.environ.get('AQUASMART_TEST_PHP') or shutil.which('php')
REPOSITORY = ROOT / 'src' / 'OperationsRepository.php'
FIXTURE = """
CREATE TABLE users (id INTEGER PRIMARY KEY);
INSERT INTO users VALUES (1),(2);
CREATE TABLE audit_logs (id INTEGER PRIMARY KEY,user_id INTEGER NOT NULL,device_id TEXT,action TEXT,metadata TEXT,created_at TEXT);
CREATE TABLE devices (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    auto_mode INTEGER NOT NULL DEFAULT 1, last_seen TEXT, online INTEGER DEFAULT 0,
    feeder INTEGER DEFAULT 0, aerator INTEGER DEFAULT 0);
INSERT INTO devices(id,user_id) VALUES ('SIM-A',1),('SIM-B',2);
CREATE TABLE feeding_schedules (id INTEGER PRIMARY KEY, device_id TEXT REFERENCES devices(id),
    time TEXT NOT NULL, duration INTEGER NOT NULL CHECK(duration BETWEEN 1 AND 30),
    days TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT, updated_at TEXT);
"""


class OperationsTests(unittest.TestCase):
    def php(self, body, env=None):
        self.assertTrue(PHP, 'PHP CLI is required (set AQUASMART_TEST_PHP)')
        self.assertTrue(REPOSITORY.exists(), 'OperationsRepository implementation missing')
        with tempfile.TemporaryDirectory(prefix='aquasmart-operations-test-') as directory:
            db = str(Path(directory) / 'test.sqlite')
            script = "<?php\ndeclare(strict_types=1);\nrequire " + json.dumps(str(REPOSITORY)) + ";\n"
            script += "$pdo = new PDO('sqlite:' . " + json.dumps(db) + ", null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);\n"
            script += "$pdo->exec('PRAGMA foreign_keys=ON'); $pdo->exec(" + json.dumps(FIXTURE) + ");\n"
            script += "function check(bool $value, string $message): void { if (!$value) throw new RuntimeException($message); }\n"
            script += "function rejects(callable $fn): void { try { $fn(); } catch (InvalidArgumentException|DomainException $e) { return; } throw new RuntimeException('Expected validation/conflict rejection'); }\n"
            script += "OperationsRepository::migrate($pdo);\n" + body + "\necho 'OK';\n"
            child_env = {**os.environ, 'AQUASMART_TIMEZONE': 'Asia/Jakarta', **(env or {})}
            result = subprocess.run([PHP], input=script, capture_output=True, text=True, env=child_env)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertEqual(result.stdout.strip(), 'OK')

    def test_manual_queue_migration_ownership_and_request_dedupe(self):
        self.php(r'''
OperationsRepository::migrate($pdo);
$c = OperationsRepository::enqueue($pdo, 1, 'SIM-A', 'feeder', true, 8, 'request-1');
check($c['status'] === 'pending' && $c['simulation'] === true, 'simulation pending');
check($c['duration'] === 8 && $c['value'] === true && strlen($c['id']) === 32, 'typed command + opaque correlation ID');
$d = OperationsRepository::enqueue($pdo, 1, 'SIM-A', 'feeder', true, 8, 'request-1');
check($c['id'] === $d['id'], 'same request exactly once');
check(OperationsRepository::enqueue($pdo, 2, 'SIM-A', 'feeder', true, 8, 'request-1') === null, 'owner checked before dedupe');
check(OperationsRepository::enqueue($pdo, 1, 'MISSING', 'aerator', false, 0, 'missing') === null, 'missing device');
check((int)$pdo->query('SELECT COUNT(*) FROM actuator_commands')->fetchColumn() === 1, 'one persisted command');
check((int)$pdo->query("SELECT feeder FROM devices WHERE id='SIM-A'")->fetchColumn() === 0, 'queue is not physical or requested state update');
''')


    def test_delivery_ack_is_correlated_and_feeding_log_is_idempotent(self):
        self.php(r'''
$c=OperationsRepository::enqueue($pdo,1,'SIM-A','feeder',true,8,'r1',1000);
rejects(fn()=>OperationsRepository::acknowledge($pdo,'SIM-A',$c['id'],'succeeded',1001));
$commands=OperationsRepository::poll($pdo,'SIM-A',1001);
check(count($commands)===1 && $commands[0]['status']==='delivered','delivery');
check(OperationsRepository::poll($pdo,'SIM-A',1002)===[],'never redeliver motor command');
rejects(fn()=>OperationsRepository::acknowledge($pdo,'SIM-B',$c['id'],'succeeded',1010));
OperationsRepository::acknowledge($pdo,'SIM-A',$c['id'],'succeeded',1010);
OperationsRepository::acknowledge($pdo,'SIM-A',$c['id'],'succeeded',1011);
rejects(fn()=>OperationsRepository::acknowledge($pdo,'SIM-A',$c['id'],'failed',1011));
check(count(OperationsRepository::feedingLogs($pdo,1,'SIM-A'))===1,'one result');
check(OperationsRepository::feedingLogs($pdo,2,'SIM-A')===null,'logs ownership');
check((int)$pdo->query("SELECT COUNT(*) FROM audit_logs WHERE action='command.succeeded'")->fetchColumn()===1,'ACK audit is idempotent');
''')

    def test_timeout_and_conflicting_requests_are_safe(self):
        self.php(r'''
$c=OperationsRepository::enqueue($pdo,1,'SIM-A','feeder',true,8,'r1',1000);
rejects(fn()=>OperationsRepository::enqueue($pdo,1,'SIM-A','feeder',true,9,'r1',1001));
rejects(fn()=>OperationsRepository::enqueue($pdo,1,'SIM-A','feeder',true,8,'r2',1001));
OperationsRepository::expire($pdo,1061);
check(OperationsRepository::poll($pdo,'SIM-A',1062)===[],'never deliver expired request');
rejects(fn()=>OperationsRepository::acknowledge($pdo,'SIM-A',$c['id'],'succeeded',1062));
check(OperationsRepository::feedingLogs($pdo,1,'SIM-A')[0]['status']==='timeout','timeout logged');
check((int)$pdo->query("SELECT COUNT(*) FROM audit_logs WHERE action='command.timeout'")->fetchColumn()===1,'timeout audit emitted once');
rejects(fn()=>OperationsRepository::enqueue($pdo,1,'SIM-A','feeder',true,31,'r3',1063));
''')

    def test_scheduler_exact_minute_timezone_weekdays_and_no_duplicate(self):
        self.php(r'''
$pdo->exec("INSERT INTO feeding_schedules(id,device_id,time,duration,days) VALUES(1,'SIM-A','08:00',8,'Senin - Jumat'),(2,'SIM-B','08:00',8,'Akhir pekan')");
$now=new DateTimeImmutable('2026-09-14T01:00:00Z');
OperationsRepository::tick($pdo,$now);OperationsRepository::tick($pdo,$now);
check((int)$pdo->query('SELECT COUNT(*) FROM actuator_commands')->fetchColumn()===1,'weekday due once');
check($pdo->query('SELECT device_id FROM actuator_commands')->fetchColumn()==='SIM-A','timezone correct');
$metadata=json_decode($pdo->query("SELECT metadata FROM audit_logs WHERE action='command.queued'")->fetchColumn(),true);
check($metadata['source']==='scheduler','scheduler source is audited');
OperationsRepository::tick($pdo,new DateTimeImmutable('2026-09-15T01:02:00Z'));
check((int)$pdo->query('SELECT COUNT(*) FROM actuator_commands')->fetchColumn()===1,'no late backfill');
''')

if __name__ == '__main__':
    unittest.main()
