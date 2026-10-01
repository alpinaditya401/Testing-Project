<?php
declare(strict_types=1);

final class DeviceAuth
{
    public static function requireKey(PDO $pdo, string $deviceId): void
    {
        $provided = trim((string) ($_SERVER['HTTP_X_DEVICE_KEY'] ?? ''));
        $query = $pdo->prepare('SELECT key_hash FROM device_credentials WHERE device_id=?');
        $query->execute([$deviceId]);
        $expected = $query->fetchColumn();
        if ($expected === false && getenv('AQUASMART_APP_ENV') === 'test') {
            // Compatibility for disposable HTTP fixtures only; never development/production.
            $legacy = (string)(getenv('AQUASMART_DEVICE_KEY') ?: '');
            $expected = $legacy === '' ? false : hash('sha256', $legacy);
        }
        if ($expected === false || $provided === '' || !hash_equals($expected, hash('sha256', $provided))) {
            Http::error('device_unauthenticated', 'Kredensial perangkat tidak valid.', 401);
        }
    }

    public static function rotate(PDO $pdo, int $owner, string $deviceId): ?string
    {
        if (ProductRepository::isProduct($pdo,$deviceId)) return null;
        $query = $pdo->prepare('SELECT 1 FROM devices WHERE id=? AND user_id=?');
        $query->execute([$deviceId, $owner]);
        if (!$query->fetchColumn()) return null;
        $key = bin2hex(random_bytes(32));
        $pdo->beginTransaction();
        try {
            $pdo->prepare('INSERT INTO device_credentials(device_id,key_hash,rotated_at) VALUES(?,?,?) ON CONFLICT(device_id) DO UPDATE SET key_hash=excluded.key_hash,rotated_at=excluded.rotated_at')
                ->execute([$deviceId, hash('sha256', $key), gmdate('Y-m-d\TH:i:s\Z')]);
            AuditRepository::record($pdo, $owner, $deviceId, 'device.key_rotated');
            $pdo->commit();
            return $key;
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }
}
