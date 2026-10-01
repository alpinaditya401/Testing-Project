<?php
declare(strict_types=1);

final class Database
{
    private static ?PDO $connection = null;

    public static function connection(bool $bootstrap = true): PDO
    {
        if (self::$connection instanceof PDO) {
            return self::$connection;
        }

        $path = getenv('AQUASMART_DB_PATH') ?: dirname(__DIR__) . '/data/aquasmart.sqlite';
        $directory = dirname($path);
        if (!is_dir($directory) && !mkdir($directory, 0775, true) && !is_dir($directory)) {
            throw new RuntimeException('Tidak dapat membuat direktori database.');
        }

        $pdo = new PDO('sqlite:' . $path, null, null, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
        $pdo->exec('PRAGMA foreign_keys = ON');
        $pdo->exec('PRAGMA journal_mode = WAL');
        self::migrate($pdo, $bootstrap);
        self::$connection = $pdo;

        return $pdo;
    }

    private static function migrate(PDO $pdo, bool $bootstrap): void
    {
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                contact TEXT,
                password_hash TEXT NOT NULL,
                name TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT "admin",
                phone TEXT NOT NULL DEFAULT "",
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )'
        );
        $userColumns = array_column($pdo->query('PRAGMA table_info(users)')->fetchAll(), 'name');
        if (!in_array('contact', $userColumns, true)) {
            $pdo->exec('ALTER TABLE users ADD COLUMN contact TEXT');
        }
        $pdo->exec(
            'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_contact_unique
             ON users(contact COLLATE NOCASE)
             WHERE contact IS NOT NULL'
        );

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS device_inventory (
                serial_number TEXT PRIMARY KEY,
                default_name TEXT NOT NULL,
                default_location TEXT NOT NULL,
                claimed_user_id INTEGER,
                claimed_at TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (claimed_user_id) REFERENCES users(id) ON DELETE SET NULL
            )'
        );

        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS devices (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                location TEXT NOT NULL,
                online INTEGER NOT NULL DEFAULT 0 CHECK (online IN (0, 1)),
                aerator INTEGER NOT NULL DEFAULT 0 CHECK (aerator IN (0, 1)),
                feeder INTEGER NOT NULL DEFAULT 0 CHECK (feeder IN (0, 1)),
                auto_mode INTEGER NOT NULL DEFAULT 0 CHECK (auto_mode IN (0, 1)),
                sort_order INTEGER NOT NULL DEFAULT 0,
                last_seen TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )'
        );
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS sensor_readings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                ph REAL NOT NULL CHECK (ph >= 0 AND ph <= 14),
                temperature REAL NOT NULL,
                turbidity REAL NOT NULL CHECK (turbidity >= 0),
                simulation INTEGER NOT NULL DEFAULT 1 CHECK (simulation IN (0, 1)),
                created_at TEXT NOT NULL,
                FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE,
                UNIQUE (device_id, created_at)
            )'
        );
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_sensor_readings_device_time ON sensor_readings(device_id, created_at DESC)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS rule_versions (
            id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
            version TEXT NOT NULL, config_json TEXT NOT NULL, created_at TEXT NOT NULL
        )');
        $pdo->exec('CREATE TABLE IF NOT EXISTS reading_rule_versions (
            reading_id INTEGER PRIMARY KEY REFERENCES sensor_readings(id) ON DELETE CASCADE,
            rule_id TEXT NOT NULL REFERENCES rule_versions(id)
        )');
        $pdo->exec('CREATE TABLE IF NOT EXISTS device_credentials (
            device_id TEXT PRIMARY KEY REFERENCES devices(id) ON DELETE CASCADE,
            key_hash TEXT NOT NULL,
            rotated_at TEXT NOT NULL
        )');
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                device_id TEXT,
                action TEXT NOT NULL,
                metadata TEXT NOT NULL DEFAULT "{}",
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
            )'
        );
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_audit_logs_user_time ON audit_logs(user_id, id DESC)');
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS feeding_schedules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                time TEXT NOT NULL,
                duration INTEGER NOT NULL CHECK (duration BETWEEN 1 AND 30),
                days TEXT NOT NULL,
                active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
            )'
        );
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_feeding_schedules_device_time ON feeding_schedules(device_id, time)');
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                device_id TEXT NOT NULL,
                severity TEXT NOT NULL CHECK (severity IN ("info", "warning", "critical")),
                message TEXT NOT NULL,
                acknowledged INTEGER NOT NULL DEFAULT 0 CHECK (acknowledged IN (0, 1)),
                created_at TEXT NOT NULL,
                acknowledged_at TEXT,
                FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
            )'
        );
        $pdo->exec('CREATE INDEX IF NOT EXISTS idx_alerts_device_time ON alerts(device_id, id DESC)');
        $pdo->exec(
            'CREATE TABLE IF NOT EXISTS threshold_settings (
                user_id INTEGER PRIMARY KEY,
                ph_min REAL NOT NULL CHECK (ph_min >= 0 AND ph_min <= 14),
                ph_max REAL NOT NULL CHECK (ph_max >= 0 AND ph_max <= 14),
                temperature_min REAL NOT NULL,
                temperature_max REAL NOT NULL,
                turbidity_max REAL NOT NULL CHECK (turbidity_max > 0),
                updated_at TEXT NOT NULL,
                CHECK (ph_min < ph_max),
                CHECK (temperature_min < temperature_max),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )'
        );

        require_once __DIR__ . '/WorkspaceRepository.php';
        WorkspaceRepository::migrate($pdo);
        require_once __DIR__ . '/ObservationRepository.php';
        ObservationRepository::migrate($pdo);
        require_once __DIR__ . '/OperationsRepository.php';
        OperationsRepository::migrate($pdo);
        require_once __DIR__ . '/Provenance.php';
        Provenance::migrate($pdo);
        require_once __DIR__ . '/ProductRepository.php';
        ProductRepository::migrate($pdo);
        if ($bootstrap && (int)$pdo->query('SELECT COUNT(*) FROM users')->fetchColumn() === 0) self::seed($pdo);
    }

    private static function seed(PDO $pdo): void
    {
        $pdo->beginTransaction();
        try {
            $beforeReading=(int)$pdo->query('SELECT COALESCE(MAX(id),0) FROM sensor_readings')->fetchColumn();
            $beforeAlert=(int)$pdo->query('SELECT COALESCE(MAX(id),0) FROM alerts')->fetchColumn();
            $count = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
            if ($count === 0) {
                $username = trim((string) (getenv('AQUASMART_SEED_USERNAME') ?: ''));
                $password = (string) (getenv('AQUASMART_SEED_PASSWORD') ?: '');
                if (!preg_match('/^[A-Za-z0-9_.-]{3,64}$/', $username) || strlen($password) < 12) {
                    throw new RuntimeException(
                        'Database baru membutuhkan AQUASMART_SEED_USERNAME dan AQUASMART_SEED_PASSWORD (minimal 12 karakter).'
                    );
                }
                $statement = $pdo->prepare(
                    'INSERT INTO users (username, password_hash, name, role, phone)
                     VALUES (:username, :password_hash, :name, :role, :phone)'
                );
                $statement->execute([
                    ':username' => $username,
                    ':password_hash' => password_hash($password, PASSWORD_DEFAULT),
                    ':name' => 'Administrator AquaSmart',
                    ':role' => 'admin',
                    ':phone' => '-',
                ]);
            }

            $userId = (int) $pdo->query('SELECT id FROM users ORDER BY id ASC LIMIT 1')->fetchColumn();
            if ($userId < 1) {
                throw new RuntimeException('User bootstrap AquaSmart tidak ditemukan.');
            }
            $unclaimedSerial = strtoupper(trim((string) (getenv('AQUASMART_UNCLAIMED_DEVICE_SERIAL') ?: '')));
            if ($unclaimedSerial !== '') {
                $inventory = $pdo->prepare(
                    'INSERT OR IGNORE INTO device_inventory
                     (serial_number, default_name, default_location)
                     VALUES (:serial_number, :default_name, :default_location)'
                );
                $inventory->execute([
                    ':serial_number' => $unclaimedSerial,
                    ':default_name' => 'Perangkat AquaSmart',
                    ':default_location' => 'Belum diatur',
                ]);
            }
            $thresholdCount = (int) $pdo->query('SELECT COUNT(*) FROM threshold_settings')->fetchColumn();
            if ($thresholdCount === 0) {
                $statement = $pdo->prepare(
                    'INSERT INTO threshold_settings
                     (user_id, ph_min, ph_max, temperature_min, temperature_max, turbidity_max, updated_at)
                     VALUES (:user_id, 6.5, 8.5, 25, 30, 50, :updated_at)'
                );
                $statement->execute([
                    ':user_id' => $userId,
                    ':updated_at' => gmdate('Y-m-d\TH:i:s\Z'),
                ]);
            }

            $deviceCount = (int) $pdo->query('SELECT COUNT(*) FROM devices')->fetchColumn();
            if ($deviceCount === 0) {
                $statement = $pdo->prepare(
                    'INSERT INTO devices
                     (id, user_id, name, location, online, aerator, feeder, auto_mode, sort_order, last_seen)
                     VALUES (:id, :user_id, :name, :location, 1, :aerator, 0, 1, :sort_order, :last_seen)'
                );
                $now = gmdate('Y-m-d\TH:i:s\Z');
                $statement->execute([
                    ':id' => 'AQS-KOLAM-01', ':user_id' => $userId, ':name' => 'Kolam Lele 1',
                    ':location' => 'Area Budidaya Utama', ':aerator' => 1, ':sort_order' => 1, ':last_seen' => $now,
                ]);
                $statement->execute([
                    ':id' => 'AQS-AQUA-02', ':user_id' => $userId, ':name' => 'Bak Aquaponik',
                    ':location' => 'Greenhouse Timur', ':aerator' => 0, ':sort_order' => 2, ':last_seen' => $now,
                ]);
            }

            $scheduleCount = (int) $pdo->query('SELECT COUNT(*) FROM feeding_schedules')->fetchColumn();
            if ($scheduleCount === 0) {
                $statement = $pdo->prepare(
                    'INSERT INTO feeding_schedules (device_id, time, duration, days, active, created_at, updated_at)
                     VALUES (:device_id, :time, :duration, :days, 1, :created_at, :updated_at)'
                );
                $nowIso = gmdate('Y-m-d\\TH:i:s\\Z');
                foreach ([['07:00', 8], ['16:30', 8]] as [$time, $duration]) {
                    $statement->execute([
                        ':device_id' => 'AQS-KOLAM-01',
                        ':time' => $time,
                        ':duration' => $duration,
                        ':days' => 'Setiap hari',
                        ':created_at' => $nowIso,
                        ':updated_at' => $nowIso,
                    ]);
                }
            }

            $alertCount = (int) $pdo->query('SELECT COUNT(*) FROM alerts')->fetchColumn();
            if ($alertCount === 0) {
                $statement = $pdo->prepare(
                    'INSERT INTO alerts (device_id, severity, message, acknowledged, created_at, acknowledged_at)
                     VALUES (:device_id, :severity, :message, :acknowledged, :created_at, :acknowledged_at)'
                );
                $now = time();
                foreach ([
                    [
                        'device_id' => 'AQS-AQUA-02',
                        'severity' => 'info',
                        'message' => 'Jadwal pakan sore selesai dijalankan.',
                        'acknowledged' => 1,
                        'created_at' => gmdate('Y-m-d\\TH:i:s\\Z', $now - 7200),
                        'acknowledged_at' => gmdate('Y-m-d\\TH:i:s\\Z', $now - 7000),
                    ],
                    [
                        'device_id' => 'AQS-AQUA-02',
                        'severity' => 'critical',
                        'message' => 'Turbidity mendekati batas maksimum.',
                        'acknowledged' => 0,
                        'created_at' => gmdate('Y-m-d\\TH:i:s\\Z', $now - 3600),
                        'acknowledged_at' => null,
                    ],
                    [
                        'device_id' => 'AQS-KOLAM-01',
                        'severity' => 'warning',
                        'message' => 'Suhu air meningkat di atas rentang ideal.',
                        'acknowledged' => 0,
                        'created_at' => gmdate('Y-m-d\\TH:i:s\\Z', $now - 900),
                        'acknowledged_at' => null,
                    ],
                ] as $alert) {
                    $statement->execute([
                        ':device_id' => $alert['device_id'],
                        ':severity' => $alert['severity'],
                        ':message' => 'SIMULASI: ' . $alert['message'],
                        ':acknowledged' => $alert['acknowledged'],
                        ':created_at' => $alert['created_at'],
                        ':acknowledged_at' => $alert['acknowledged_at'],
                    ]);
                }
            }

            $readingCount = (int) $pdo->query('SELECT COUNT(*) FROM sensor_readings')->fetchColumn();
            if ($readingCount === 0) {
                $statement = $pdo->prepare(
                    'INSERT INTO sensor_readings (device_id, ph, temperature, turbidity, simulation, created_at)
                     VALUES (:device_id, :ph, :temperature, :turbidity, 1, :created_at)'
                );
                $now = time();
                foreach ([
                    ['id' => 'AQS-KOLAM-01', 'ph' => 7.1, 'temperature' => 28.4, 'turbidity' => 42.0],
                    ['id' => 'AQS-AQUA-02', 'ph' => 6.8, 'temperature' => 27.8, 'turbidity' => 35.0],
                ] as $device) {
                    for ($index = 17; $index >= 0; $index--) {
                        $isLatest = $index === 0;
                        $statement->execute([
                            ':device_id' => $device['id'],
                            ':ph' => $isLatest ? $device['ph'] : round($device['ph'] + sin($index / 3) * 0.16, 2),
                            ':temperature' => $isLatest ? $device['temperature'] : round($device['temperature'] + cos($index / 4) * 0.55, 1),
                            ':turbidity' => $isLatest ? $device['turbidity'] : round($device['turbidity'] + sin($index / 2) * 5, 1),
                            ':created_at' => gmdate('Y-m-d\TH:i:s\Z', $now - $index * 300),
                        ]);
                    }
                }
            }
            $pdo->prepare("UPDATE sensor_readings SET provenance='seed',source_session='bootstrap-v1' WHERE id>?")->execute([$beforeReading]);
            $pdo->prepare("UPDATE alerts SET provenance='seed',source_session='bootstrap-v1' WHERE id>?")->execute([$beforeAlert]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
    }
}
