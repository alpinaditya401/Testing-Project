<?php
declare(strict_types=1);

final class ProfileRepository
{
    public static function update(PDO $pdo, int $userId, string $name, string $phone): array
    {
        $pdo->beginTransaction();
        try {
            $statement = $pdo->prepare(
                'UPDATE users
                 SET name = :name, phone = :phone, updated_at = :updated_at
                 WHERE id = :id'
            );
            $statement->execute([
                ':name' => $name,
                ':phone' => $phone,
                ':updated_at' => gmdate('Y-m-d\TH:i:s\Z'),
                ':id' => $userId,
            ]);
            AuditRepository::record($pdo, $userId, null, 'profile.updated', [
                'name' => $name,
                'phone' => $phone,
            ]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }

        $statement = $pdo->prepare(
            'SELECT id, username, name, role, phone FROM users WHERE id = :id LIMIT 1'
        );
        $statement->execute([':id' => $userId]);
        $user = $statement->fetch();
        if (!$user) {
            throw new RuntimeException('Profil pengguna tidak ditemukan.');
        }
        $user['id'] = (int) $user['id'];
        return $user;
    }
}
