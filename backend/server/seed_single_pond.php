<?php
declare(strict_types=1);

// Refuse existing databases so setup never replaces accounts or sensor history.
if (PHP_SAPI !== 'cli' || count($argv) !== 2 || file_exists($argv[1])) {
    fwrite(STDERR, "Usage: php server/seed_single_pond.php <new-database-path>\nExisting files are refused.\n");
    exit(2);
}
putenv('AQUASMART_DB_PATH=' . $argv[1]);
require_once __DIR__ . '/src/Database.php';
require_once __DIR__ . '/src/ThresholdRules.php';
require_once __DIR__ . '/src/AuditRepository.php';
require_once __DIR__ . '/src/DeviceAuth.php';
$pdo = Database::connection(false);
$passwords = ['admin' => bin2hex(random_bytes(10)), 'user' => bin2hex(random_bytes(10))];
$pdo->beginTransaction();
try {
    $insert = $pdo->prepare('INSERT INTO users(username,password_hash,name,role,phone,workspace_owner_id) VALUES(?,?,?,?,?,?)');
    $insert->execute(['admin', password_hash($passwords['admin'], PASSWORD_DEFAULT), 'Admin Kolam', 'admin', '', null]);
    $owner = (int) $pdo->lastInsertId();
    $insert->execute(['user', password_hash($passwords['user'], PASSWORD_DEFAULT), 'User Kolam', 'viewer', '', $owner]);
    $defaults = ThresholdRules::defaults();
    $pdo->prepare('INSERT INTO threshold_settings(user_id,ph_min,ph_max,temperature_min,temperature_max,turbidity_max,updated_at) VALUES(?,?,?,?,?,?,?)')
        ->execute([$owner, $defaults['ph_min'], $defaults['ph_max'], $defaults['temperature_min'], $defaults['temperature_max'], $defaults['turbidity_max'], gmdate('Y-m-d\TH:i:s\Z')]);
    $pdo->prepare('INSERT INTO devices(id,user_id,name,location,online,aerator,feeder,auto_mode,sort_order,last_seen) VALUES(?,?,?,?,0,0,0,0,1,NULL)')
        ->execute(['AQS-KOLAM-01', $owner, 'Kolam Utama', 'Area Budidaya']);
    $pdo->prepare('INSERT INTO device_inventory(serial_number,default_name,default_location,claimed_user_id,claimed_at) VALUES(?,?,?,?,?)')
        ->execute(['AQS-KOLAM-01', 'Kolam Utama', 'Area Budidaya', $owner, gmdate('Y-m-d\TH:i:s\Z')]);
    $pdo->commit();
} catch (Throwable $error) {
    $pdo->rollBack();
    throw $error;
}
$key = DeviceAuth::rotate($pdo, $owner, 'AQS-KOLAM-01');
fwrite(STDOUT, json_encode([
    'label' => 'SATU KOLAM / LOCAL', 'database' => realpath($argv[1]),
    'admin' => ['username' => 'admin', 'password' => $passwords['admin']],
    'viewer' => ['username' => 'user', 'password' => $passwords['user']],
    'device_keys' => ['AQS-KOLAM-01' => $key],
], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . "\n");
