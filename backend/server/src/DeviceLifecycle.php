<?php
declare(strict_types=1);

final class DeviceLifecycle
{
    public static function claim(PDO $pdo, int $owner, string $serial): array
    {
        $serial = strtoupper(trim($serial));
        if (ProductRepository::isProduct($pdo,$serial)) throw new InvalidArgumentException('Unit ini memerlukan kode aktivasi melalui Tambah Perangkat.');
        if (!preg_match('/^[A-Z0-9_-]{1,128}$/D', $serial)) {
            throw new InvalidArgumentException('Serial perangkat tidak valid.');
        }
        $pdo->beginTransaction();
        try {
            $query = $pdo->prepare('SELECT * FROM device_inventory WHERE serial_number=?');
            $query->execute([$serial]);
            $row = $query->fetch();
            if (!$row) throw new InvalidArgumentException('Serial perangkat belum terdaftar.');
            if ($row['claimed_user_id'] !== null) throw new DomainException('Serial perangkat sudah diklaim.');
            $now = gmdate('Y-m-d\TH:i:s\Z');
            $pdo->prepare('INSERT INTO devices(id,user_id,name,location) VALUES(?,?,?,?)')
                ->execute([$serial, $owner, $row['default_name'], $row['default_location']]);
            $query = $pdo->prepare('UPDATE device_inventory SET claimed_user_id=?,claimed_at=? WHERE serial_number=? AND claimed_user_id IS NULL');
            $query->execute([$owner, $now, $serial]);
            if ($query->rowCount() !== 1) throw new DomainException('Serial perangkat sudah diklaim.');
            AuditRepository::record($pdo, $owner, $serial, 'device.claimed');
            $pdo->commit();
            return ['id' => $serial, 'name' => $row['default_name'], 'location' => $row['default_location']];
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }

    public static function update(PDO $pdo, int $owner, string $id, array $body): bool
    {
        $name = $body['name'] ?? null;
        $location = $body['location'] ?? null;
        if (!is_string($name) || !is_string($location) || trim($name) === '' || trim($location) === ''
            || mb_strlen($name) > 100 || mb_strlen($location) > 150) {
            throw new InvalidArgumentException('Nama wajib 1–100 karakter dan lokasi 1–150 karakter.');
        }
        $pdo->beginTransaction();
        try {
            $query = $pdo->prepare('UPDATE devices SET name=?,location=?,updated_at=? WHERE id=? AND user_id=?');
            $query->execute([trim($name), trim($location), gmdate('Y-m-d\TH:i:s\Z'), $id, $owner]);
            $updated = $query->rowCount() === 1;
            if ($updated) AuditRepository::record($pdo, $owner, $id, 'device.updated');
            $pdo->commit();
            return $updated;
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }

    public static function heartbeat(PDO $pdo, string $id): ?array
    {
        $query = $pdo->prepare('SELECT user_id FROM devices WHERE id=?');
        $query->execute([$id]);
        $owner = $query->fetchColumn();
        if ($owner === false) return null;
        $now = gmdate('Y-m-d\TH:i:s\Z');
        $pdo->beginTransaction();
        try {
            $pdo->prepare('UPDATE devices SET online=1,last_seen=?,updated_at=? WHERE id=?')->execute([$now,$now,$id]);
            $pdo->prepare('UPDATE product_units SET first_heartbeat=COALESCE(first_heartbeat,?),last_heartbeat=? WHERE serial=?')->execute([strtotime($now),strtotime($now),$id]);
            AuditRepository::record($pdo, (int)$owner, $id, 'device.heartbeat', ['transport'=>'HTTP', 'hardware_verified'=>false,'provenance'=>'device']);
            $pdo->commit();
            return ['device_id'=>$id, 'last_seen'=>$now, 'online'=>true, 'hardware_verified'=>false];
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }
}
