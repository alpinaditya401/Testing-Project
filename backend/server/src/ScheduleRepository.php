<?php
declare(strict_types=1);

final class ScheduleRepository
{
    public static function allForDevice(PDO $pdo, int $userId, string $deviceId): ?array
    {
        if (!self::userOwnsDevice($pdo, $userId, $deviceId)) {
            return null;
        }

        $statement = $pdo->prepare(
            'SELECT id, time, duration, days, active, created_at
             FROM feeding_schedules
             WHERE device_id = :device_id
             ORDER BY time, id'
        );
        $statement->execute([':device_id' => $deviceId]);

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'time' => $row['time'],
            'duration' => (int) $row['duration'],
            'days' => $row['days'],
            'active' => (bool) $row['active'],
            'created_at' => $row['created_at'],
        ], $statement->fetchAll());
    }

    public static function create(
        PDO $pdo,
        int $userId,
        string $deviceId,
        string $time,
        int $duration,
        string $days
    ): ?array {
        if (!self::userOwnsDevice($pdo, $userId, $deviceId)) {
            return null;
        }

        $now = gmdate('Y-m-d\TH:i:s\Z');
        $pdo->beginTransaction();
        try {
            $statement = $pdo->prepare(
                'INSERT INTO feeding_schedules (device_id, time, duration, days, active, created_at, updated_at)
                 VALUES (:device_id, :time, :duration, :days, 1, :created_at, :updated_at)'
            );
            $statement->execute([
                ':device_id' => $deviceId,
                ':time' => $time,
                ':duration' => $duration,
                ':days' => $days,
                ':created_at' => $now,
                ':updated_at' => $now,
            ]);
            $id = (int) $pdo->lastInsertId();
            AuditRepository::record($pdo, $userId, $deviceId, 'schedule.created', [
                'schedule_id' => $id,
                'time' => $time,
                'duration' => $duration,
                'days' => $days,
            ]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }

        return [
            'id' => $id,
            'time' => $time,
            'duration' => $duration,
            'days' => $days,
            'active' => true,
            'created_at' => $now,
        ];
    }

    public static function delete(PDO $pdo, int $userId, int $scheduleId): bool
    {
        $statement = $pdo->prepare(
            'SELECT fs.device_id
             FROM feeding_schedules fs
             INNER JOIN devices d ON d.id = fs.device_id
             WHERE fs.id = :id AND d.user_id = :user_id'
        );
        $statement->execute([':id' => $scheduleId, ':user_id' => $userId]);
        $deviceId = $statement->fetchColumn();
        if ($deviceId === false) {
            return false;
        }

        $pdo->beginTransaction();
        try {
            $delete = $pdo->prepare('DELETE FROM feeding_schedules WHERE id = :id');
            $delete->execute([':id' => $scheduleId]);
            AuditRepository::record($pdo, $userId, (string) $deviceId, 'schedule.deleted', [
                'schedule_id' => $scheduleId,
            ]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
        return true;
    }

    private static function userOwnsDevice(PDO $pdo, int $userId, string $deviceId): bool
    {
        $statement = $pdo->prepare(
            'SELECT 1 FROM devices WHERE id = :device_id AND user_id = :user_id'
        );
        $statement->execute([':device_id' => $deviceId, ':user_id' => $userId]);
        return (bool) $statement->fetchColumn();
    }
}
