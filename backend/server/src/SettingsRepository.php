<?php
declare(strict_types=1);

final class SettingsRepository
{
    public static function thresholds(PDO $pdo, int $userId): array
    {
        $statement = $pdo->prepare(
            'SELECT ph_min, ph_max, temperature_min, temperature_max, turbidity_max
             FROM threshold_settings
             WHERE user_id = :user_id'
        );
        $statement->execute([':user_id' => $userId]);
        $row = $statement->fetch();
        if (!$row) {
            throw new RuntimeException('Pengaturan threshold tidak ditemukan.');
        }
        return self::mapThresholds($row);
    }

    public static function updateThresholds(PDO $pdo, int $userId, array $values): array
    {
        $pdo->beginTransaction();
        try {
            $statement = $pdo->prepare(
                'UPDATE threshold_settings
                 SET ph_min = :ph_min,
                     ph_max = :ph_max,
                     temperature_min = :temperature_min,
                     temperature_max = :temperature_max,
                     turbidity_max = :turbidity_max,
                     updated_at = :updated_at
                 WHERE user_id = :user_id'
            );
            $statement->execute([
                ':ph_min' => $values['ph_min'],
                ':ph_max' => $values['ph_max'],
                ':temperature_min' => $values['temperature_min'],
                ':temperature_max' => $values['temperature_max'],
                ':turbidity_max' => $values['turbidity_max'],
                ':updated_at' => gmdate('Y-m-d\TH:i:s\Z'),
                ':user_id' => $userId,
            ]);
            AuditRepository::record($pdo, $userId, null, 'thresholds.updated', $values);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }
        return self::thresholds($pdo, $userId);
    }

    private static function mapThresholds(array $row): array
    {
        return [
            'ph_min' => (float) $row['ph_min'],
            'ph_max' => (float) $row['ph_max'],
            'temperature_min' => (float) $row['temperature_min'],
            'temperature_max' => (float) $row['temperature_max'],
            'turbidity_max' => (float) $row['turbidity_max'],
        ];
    }
}
