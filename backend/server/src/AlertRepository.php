<?php
declare(strict_types=1);

final class AlertRepository
{
    public static function recent(PDO $pdo, int $userId, int $limit): array
    {
        $limit = max(1, min(100, $limit));
        $statement = $pdo->prepare(
            'SELECT a.id, a.device_id, a.severity, a.message, a.acknowledged, a.created_at, a.acknowledged_at, a.provenance, a.source_session
             FROM alerts a
             INNER JOIN devices d ON d.id = a.device_id
             WHERE d.user_id = :user_id
             ORDER BY a.id DESC
             LIMIT :limit'
        );
        $statement->bindValue(':user_id', $userId, PDO::PARAM_INT);
        $statement->bindValue(':limit', $limit, PDO::PARAM_INT);
        $statement->execute();

        return array_map(static fn (array $row): array => [
            'id' => (int) $row['id'],
            'device_id' => $row['device_id'],
            'severity' => $row['severity'],
            'message' => $row['message'],
            'source' => Provenance::label($row['provenance']),
            'provenance'=>$row['provenance'],'source_session'=>$row['source_session'],
            'acknowledged' => (bool) $row['acknowledged'],
            'created_at' => $row['created_at'],
            'acknowledged_at' => $row['acknowledged_at'],
        ], $statement->fetchAll());
    }

    public static function acknowledge(PDO $pdo, int $userId, int $alertId): ?array
    {
        $statement = $pdo->prepare(
            'SELECT a.id, a.device_id, a.severity, a.message, a.acknowledged, a.created_at, a.acknowledged_at, a.provenance, a.source_session
             FROM alerts a
             INNER JOIN devices d ON d.id = a.device_id
             WHERE a.id = :id AND d.user_id = :user_id'
        );
        $statement->execute([':id' => $alertId, ':user_id' => $userId]);
        $alert = $statement->fetch();
        if (!$alert) {
            return null;
        }

        if (!(bool) $alert['acknowledged']) {
            $acknowledgedAt = gmdate('Y-m-d\TH:i:s\Z');
            $pdo->beginTransaction();
            try {
                $update = $pdo->prepare(
                    'UPDATE alerts SET acknowledged = 1, acknowledged_at = :acknowledged_at WHERE id = :id'
                );
                $update->execute([':acknowledged_at' => $acknowledgedAt, ':id' => $alertId]);
                AuditRepository::record($pdo, $userId, $alert['device_id'], 'alert.acknowledged', [
                    'alert_id' => $alertId, 'provenance'=>'manual','origin_provenance'=>$alert['provenance'], 'origin_session'=>$alert['source_session'],
                ]);
                $pdo->commit();
                $alert['acknowledged'] = 1;
                $alert['acknowledged_at'] = $acknowledgedAt;
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $error;
            }
        }

        return [
            'id' => (int) $alert['id'],
            'device_id' => $alert['device_id'],
            'severity' => $alert['severity'],
            'message' => $alert['message'],
            'source' => Provenance::label($alert['provenance']),
            'provenance'=>$alert['provenance'],'source_session'=>$alert['source_session'],
            'acknowledged' => (bool) $alert['acknowledged'],
            'created_at' => $alert['created_at'],
            'acknowledged_at' => $alert['acknowledged_at'],
        ];
    }

    public static function unacknowledgedCount(PDO $pdo, int $userId): int
    {
        $statement = $pdo->prepare(
            'SELECT COUNT(*)
             FROM alerts a
             INNER JOIN devices d ON d.id = a.device_id
             WHERE d.user_id = :user_id AND a.acknowledged = 0'
        );
        $statement->execute([':user_id' => $userId]);
        return (int) $statement->fetchColumn();
    }

}
