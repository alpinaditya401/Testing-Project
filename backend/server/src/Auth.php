<?php
declare(strict_types=1);

require_once __DIR__ . '/ThresholdRules.php';

final class Auth
{
    public static function startSession(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        $secure = (getenv('AQUASMART_SESSION_SECURE') ?: '0') === '1';
        session_name('aquasmart_session');
        session_set_cookie_params([
            'lifetime' => 0,
            'path' => '/',
            'secure' => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        session_start();
    }

    public static function login(PDO $pdo, string $username, string $password): ?array
    {
        $username = trim($username);
        if (filter_var($username, FILTER_VALIDATE_EMAIL)) {
            $username = strtolower($username);
        } elseif (preg_match('/^08[\d\s-]+$/D', $username)) {
            $username = preg_replace('/[\s-]+/', '', $username);
        }
        $statement = $pdo->prepare(
            'SELECT id, username, contact, password_hash, name, role, phone, workspace_owner_id FROM users WHERE username = :username LIMIT 1'
        );
        $statement->execute([':username' => $username]);
        $user = $statement->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            return null;
        }

        self::establishSession((int) $user['id']);
        AuditRepository::record($pdo, (int)$user['id'], null, 'auth.login');

        unset($user['password_hash']);
        $user['id'] = (int) $user['id'];
        return $user;
    }

    public static function register(
        PDO $pdo,
        string $name,
        string $contact,
        string $password,
        string $serialNumber = ''
    ): array
    {
        $contact = strtolower(trim($contact));
        $algorithm = defined('PASSWORD_ARGON2ID') ? PASSWORD_ARGON2ID : PASSWORD_DEFAULT;
        $passwordHash = password_hash($password, $algorithm);
        if ($passwordHash === false) {
            throw new RuntimeException('Password tidak dapat diproses.');
        }

        $pdo->beginTransaction();
        try {
            $statement = $pdo->prepare(
                'INSERT INTO users (username, contact, password_hash, name, role, phone)
                 VALUES (:username, :contact, :password_hash, :name, :role, :phone)'
            );
            $statement->execute([
                ':username' => $contact,
                ':contact' => $contact,
                ':password_hash' => $passwordHash,
                ':name' => $name,
                ':role' => 'admin',
                ':phone' => '',
            ]);
            $userId = (int) $pdo->lastInsertId();
            // Defaults come from ThresholdRules so the values published by
            // GET /api/rules and the values seeded here can never drift apart.
            $defaults = ThresholdRules::defaults();
            $thresholds = $pdo->prepare(
                'INSERT INTO threshold_settings
                 (user_id, ph_min, ph_max, temperature_min, temperature_max, turbidity_max, updated_at)
                 VALUES (:user_id, :ph_min, :ph_max, :temperature_min, :temperature_max, :turbidity_max, :updated_at)'
            );
            $thresholds->execute([
                ':user_id' => $userId,
                ':ph_min' => $defaults['ph_min'],
                ':ph_max' => $defaults['ph_max'],
                ':temperature_min' => $defaults['temperature_min'],
                ':temperature_max' => $defaults['temperature_max'],
                ':turbidity_max' => $defaults['turbidity_max'],
                ':updated_at' => gmdate('Y-m-d\\TH:i:s\\Z'),
            ]);
            $serialNumber = strtoupper(trim($serialNumber));
            if ($serialNumber !== '') {
                if (ProductRepository::isProduct($pdo,$serialNumber)) throw new InvalidArgumentException('Serial perangkat tidak tersedia.');
                $inventory = $pdo->prepare(
                    'SELECT default_name, default_location, claimed_user_id
                     FROM device_inventory
                     WHERE serial_number = :serial_number'
                );
                $inventory->execute([':serial_number' => $serialNumber]);
                $provisioned = $inventory->fetch();
                if (!$provisioned) {
                    throw new InvalidArgumentException('Serial perangkat tidak tersedia.');
                }
                if ($provisioned['claimed_user_id'] !== null) {
                    throw new InvalidArgumentException('Serial perangkat sudah digunakan.');
                }

                $device = $pdo->prepare(
                    'INSERT INTO devices
                     (id, user_id, name, location, online, aerator, feeder, auto_mode, sort_order, last_seen)
                     VALUES (:id, :user_id, :name, :location, 0, 0, 0, 0, 1, NULL)'
                );
                $device->execute([
                    ':id' => $serialNumber,
                    ':user_id' => $userId,
                    ':name' => $provisioned['default_name'],
                    ':location' => $provisioned['default_location'],
                ]);

                $claim = $pdo->prepare(
                    'UPDATE device_inventory
                     SET claimed_user_id = :user_id, claimed_at = :claimed_at
                     WHERE serial_number = :serial_number AND claimed_user_id IS NULL'
                );
                $claim->execute([
                    ':user_id' => $userId,
                    ':claimed_at' => gmdate('Y-m-d\\TH:i:s\\Z'),
                    ':serial_number' => $serialNumber,
                ]);
                if ($claim->rowCount() !== 1) {
                    throw new RuntimeException('Serial perangkat gagal diklaim.');
                }
            }
            AuditRepository::record($pdo, $userId, $serialNumber !== '' ? $serialNumber : null, 'auth.register');
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }

        self::establishSession($userId);
        $user = self::user($pdo);
        if ($user === null) {
            throw new RuntimeException('Pengguna baru tidak ditemukan.');
        }
        return $user;
    }

    private static function establishSession(int $userId): void
    {
        session_regenerate_id(true);
        $_SESSION['user_id'] = $userId;
        $_SESSION['csrf_token'] = bin2hex(random_bytes(24));
    }

    public static function user(PDO $pdo): ?array
    {
        $userId = filter_var($_SESSION['user_id'] ?? null, FILTER_VALIDATE_INT);
        if ($userId === false || $userId === null) {
            return null;
        }

        $statement = $pdo->prepare(
            'SELECT id, username, contact, name, role, phone, workspace_owner_id FROM users WHERE id = :id LIMIT 1'
        );
        $statement->execute([':id' => $userId]);
        $user = $statement->fetch();
        if (!$user) {
            return null;
        }
        $user['id'] = (int) $user['id'];
        return $user;
    }

    public static function requireUser(PDO $pdo): array
    {
        $user = self::user($pdo);
        if ($user === null) {
            Http::error('unauthenticated', 'Silakan login terlebih dahulu.', 401);
        }
        return $user;
    }

    public static function workspaceId(array $user): int
    {
        return $user['workspace_owner_id'] === null ? $user['id'] : (int)$user['workspace_owner_id'];
    }

    public static function requireAdmin(PDO $pdo): array
    {
        $user = self::requireUser($pdo);
        if ($user['role'] !== 'admin' || $user['workspace_owner_id'] !== null) {
            Http::error('forbidden', 'Viewer hanya memiliki akses baca.', 403);
        }
        return $user;
    }

    public static function requireCsrf(): void
    {
        $expected = self::csrfToken();
        $provided = trim((string) ($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''));
        if ($expected === '' || $provided === '' || !hash_equals($expected, $provided)) {
            Http::error('csrf_mismatch', 'Token CSRF tidak valid.', 403);
        }
    }

    public static function logout(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(
                session_name(),
                '',
                [
                    'expires' => time() - 42000,
                    'path' => $params['path'],
                    'domain' => $params['domain'],
                    'secure' => $params['secure'],
                    'httponly' => $params['httponly'],
                    'samesite' => $params['samesite'] ?? 'Lax',
                ]
            );
        }
        session_destroy();
    }

    public static function csrfToken(): string
    {
        return (string) ($_SESSION['csrf_token'] ?? '');
    }
}
