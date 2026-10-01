<?php
declare(strict_types=1);

// A fresh database is mandatory so repeated demos never overwrite user data.
if (PHP_SAPI !== 'cli' || count($argv) !== 2 || file_exists($argv[1])) {
    fwrite(STDERR, "Usage: php server/seed_local.php <new-database-path>\nExisting files are refused.\n");
    exit(2);
}
$path = $argv[1];
$admin = 'admin_' . bin2hex(random_bytes(4));
$viewer = 'viewer_' . bin2hex(random_bytes(4));
$adminPassword = bin2hex(random_bytes(16));
$viewerPassword = bin2hex(random_bytes(16));
putenv('AQUASMART_DB_PATH=' . $path);
putenv('AQUASMART_SEED_USERNAME=' . $admin);
putenv('AQUASMART_SEED_PASSWORD=' . $adminPassword);
putenv('AQUASMART_UNCLAIMED_DEVICE_SERIAL=AQS-AVAILABLE');
require_once __DIR__ . '/src/Database.php';
require_once __DIR__ . '/src/AuditRepository.php';
require_once __DIR__ . '/src/DeviceRepository.php';
require_once __DIR__ . '/src/DeviceAuth.php';
$pdo = Database::connection();
$owner = (int) $pdo->query('SELECT id FROM users ORDER BY id LIMIT 1')->fetchColumn();
$pdo->beginTransaction();
try {
    $pdo->prepare('INSERT INTO users(username,password_hash,name,role,workspace_owner_id) VALUES(?,?,?,?,?)')
        ->execute([$viewer, password_hash($viewerPassword, PASSWORD_DEFAULT), 'Viewer SIMULASI', 'viewer', $owner]);
    $now = gmdate('Y-m-d\TH:i:s\Z');
    foreach (['AQS-EMPTY', 'AQS-OFFLINE', 'AQS-WARNING', 'AQS-CRITICAL'] as $index => $id) {
        $pdo->prepare('INSERT INTO devices(id,user_id,name,location,online,last_seen,sort_order) VALUES(?,?,?,?,?,?,?)')
            ->execute([$id, $owner, substr($id, 4) . ' SIMULASI', 'Laboratorium lokal', $id === 'AQS-OFFLINE' ? 0 : 1, $now, $index + 3]);
    }
    $pdo->prepare('INSERT INTO device_inventory(serial_number,default_name,default_location,claimed_user_id,claimed_at) VALUES(?,?,?,?,?)')
        ->execute(['AQS-KOLAM-01', 'Kolam SIMULASI', 'Laboratorium lokal', $owner, $now]);
    $pdo->commit();
} catch (Throwable $error) {
    $pdo->rollBack();
    throw $error;
}
foreach (['AQS-OFFLINE' => 20, 'AQS-WARNING' => 60, 'AQS-CRITICAL' => 150] as $id => $ntu) {
    DeviceRepository::ingestReading($pdo, $id, 7.1, 28, $ntu, true, $now);
}
$pdo->exec("UPDATE devices SET online=0,last_seen=NULL WHERE id='AQS-OFFLINE'");
$pdo->exec("UPDATE alerts SET severity='critical' WHERE device_id='AQS-CRITICAL'");
foreach (['succeeded', 'failed', 'timeout'] as $offset => $status) {
    $clock = time() - 180 - $offset * 120;
    $command = OperationsRepository::enqueue($pdo, $owner, 'AQS-KOLAM-01', 'feeder', true, 1, 'seed-' . $status, $clock);
    OperationsRepository::poll($pdo, 'AQS-KOLAM-01', $clock + 1);
    if ($status === 'timeout') OperationsRepository::expire($pdo, $clock + 90);
    else OperationsRepository::acknowledge($pdo, 'AQS-KOLAM-01', $command['id'], $status, $clock + 2);
}
ObservationRepository::create($pdo, $owner, ['device_id' => 'AQS-KOLAM-01', 'observed_at' => gmdate('Y-m-d'),
    'weight_g' => 125, 'length_cm' => 18, 'notes' => 'SIMULASI: contoh observasi manual, bukan hasil panen.']);
$fixtures = ['valid' => ['ph' => 7.1, 'temperature' => 28, 'turbidity' => 20, 'simulation' => true, 'created_at' => $now],
    'invalid' => ['ph' => 15, 'temperature' => 28, 'turbidity' => -1, 'simulation' => true],
    'duplicate' => 'Kirim payload valid dua kali dengan device_id dan created_at yang sama; jumlah reading tetap satu.'];
$deviceKeys = [];
foreach ($pdo->query('SELECT id FROM devices')->fetchAll(PDO::FETCH_COLUMN) as $id) {
    $deviceKeys[$id] = DeviceAuth::rotate($pdo, $owner, $id);
}
foreach (['sensor_readings','alerts','actuator_commands','growth_observations','audit_logs'] as $table) {
    $pdo->exec("UPDATE $table SET provenance='seed',source_session='seed-local-v1'");
}
fwrite(STDOUT, json_encode(['label' => 'SIMULASI / LOCAL PROTOTYPE', 'database' => realpath($path),
    'admin' => ['username' => $admin, 'password' => $adminPassword],
    'viewer' => ['username' => $viewer, 'password' => $viewerPassword],
    'serials' => ['available' => 'AQS-AVAILABLE', 'claimed' => 'AQS-KOLAM-01', 'invalid' => 'AQS-NOT-REGISTERED'],
    'device_keys' => $deviceKeys, 'fixtures' => $fixtures], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
