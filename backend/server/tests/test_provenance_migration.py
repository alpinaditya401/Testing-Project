import json
import subprocess
import unittest
from api_integration import ROOT


class ProvenanceMigrationTests(unittest.TestCase):
    def test_legacy_rows_preserved_idempotent_and_failure_rolls_back(self):
        script = r'''
require 'server/src/Provenance.php';
function fixture($broken=false) {
    $pdo=new PDO('sqlite::memory:',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
    foreach (['sensor_readings','alerts','actuator_commands','growth_observations','audit_logs'] as $table) {
        if ($broken && $table==='audit_logs') continue;
        $pdo->exec("CREATE TABLE $table(id INTEGER PRIMARY KEY, original TEXT NOT NULL)");
        $pdo->exec("INSERT INTO $table VALUES(1,'old value')");
    }
    return $pdo;
}
$pdo=fixture();Provenance::migrate($pdo);Provenance::migrate($pdo);
$rows=[];
foreach (['sensor_readings','alerts','actuator_commands','growth_observations','audit_logs'] as $table) $rows[$table]=$pdo->query("SELECT * FROM $table")->fetchAll();
$broken=fixture(true);$rolledBack=false;
try {Provenance::migrate($broken);} catch(Throwable $error) {$rolledBack=true;}
echo json_encode(['rows'=>$rows,'rolled_back'=>$rolledBack,'columns'=>array_column($broken->query('PRAGMA table_info(sensor_readings)')->fetchAll(),'name')]);
'''
        result = subprocess.run(['php', '-r', script], cwd=ROOT, capture_output=True, text=True, timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        data = json.loads(result.stdout)
        for rows in data['rows'].values():
            self.assertEqual(rows, [dict(id=1, original='old value', provenance='legacy_unverified', source_session=None)])
        self.assertTrue(data['rolled_back'])
        self.assertEqual(data['columns'], ['id', 'original'])
