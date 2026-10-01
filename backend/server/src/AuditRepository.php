<?php
declare(strict_types=1);

final class AuditRepository
{
    public static function record(
        PDO $pdo,
        int $userId,
        ?string $deviceId,
        string $action,
        array $metadata = []
    ): void {
        $statement = $pdo->prepare(
            'INSERT INTO audit_logs (user_id, device_id, action, metadata, created_at)
             VALUES (:user_id, :device_id, :action, :metadata, :created_at)'
        );
        $statement->execute([
            ':user_id' => $userId,
            ':device_id' => $deviceId,
            ':action' => $action,
            ':metadata' => json_encode($metadata, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
            ':created_at' => gmdate('Y-m-d\TH:i:s\Z'),
        ]);
        if (class_exists('Provenance')) Provenance::mark($pdo,'audit_logs',(int)$pdo->lastInsertId(),$metadata['provenance']??'manual',$metadata['source_session']??null);
    }

    public static function recent(PDO $pdo, int $userId, int $limit): array
    {
        $limit = max(1, min(100, $limit));
        $statement = $pdo->prepare(
            'SELECT id, device_id, action, metadata, created_at, provenance, source_session
             FROM audit_logs
             WHERE user_id = :user_id
             ORDER BY id DESC
             LIMIT :limit'
        );
        $statement->bindValue(':user_id', $userId, PDO::PARAM_INT);
        $statement->bindValue(':limit', $limit, PDO::PARAM_INT);
        $statement->execute();

        return array_map(static function (array $row): array {
            $metadata = json_decode((string) $row['metadata'], true);
            return [
                'id' => (int) $row['id'],
                'device_id' => $row['device_id'],
                'action' => $row['action'],
                'provenance'=>$row['provenance'],'source_session'=>$row['source_session'],
                'metadata' => is_array($metadata) ? $metadata : [],
                'created_at' => $row['created_at'],
            ];
        }, $statement->fetchAll());
    }
}
