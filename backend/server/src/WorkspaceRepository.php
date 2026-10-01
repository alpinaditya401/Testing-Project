<?php
declare(strict_types=1);

final class WorkspaceRepository
{
    public static function migrate(PDO $pdo): void
    {
        $columns = array_column($pdo->query('PRAGMA table_info(users)')->fetchAll(), 'name');
        if (!in_array('workspace_owner_id', $columns, true)) {
            $pdo->exec('ALTER TABLE users ADD COLUMN workspace_owner_id INTEGER REFERENCES users(id)');
            $pdo->exec("UPDATE users SET role='admin' WHERE role='user'");
        }
        $pdo->exec('CREATE TABLE IF NOT EXISTS workspace_invitations (
            id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL REFERENCES users(id),
            contact TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
            expires_at INTEGER NOT NULL, accepted_at INTEGER, revoked_at INTEGER
        )');
    }

    public static function invite(PDO $pdo, array $owner, string $contact): array
    {
        $contact = strtolower(trim($contact));
        if (!filter_var($contact, FILTER_VALIDATE_EMAIL) && !preg_match('/^08\d{8,13}$/', $contact)) {
            throw new InvalidArgumentException('Kontak undangan tidak valid.');
        }
        $token = bin2hex(random_bytes(32));
        $expires = time() + 86400;
        $pdo->beginTransaction();
        try {
            $q = $pdo->prepare('INSERT INTO workspace_invitations(owner_id,contact,token_hash,expires_at) VALUES(?,?,?,?)');
            $q->execute([$owner['id'],$contact,hash('sha256',$token),$expires]);
            $id = (int)$pdo->lastInsertId();
            AuditRepository::record($pdo,$owner['id'],null,'workspace.invited',['invitation_id'=>$id,'contact'=>$contact]);
            $pdo->commit();
            return ['id'=>$id,'contact'=>$contact,'token'=>$token,'expires_at'=>gmdate('c',$expires)];
        } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    }

    public static function accept(PDO $pdo, array $user, string $token): void
    {
        if (!preg_match('/^[a-f0-9]{64}$/D',$token)) throw new InvalidArgumentException('Undangan tidak valid.');
        $pdo->beginTransaction();
        try {
            $q=$pdo->prepare('SELECT i.* FROM workspace_invitations i JOIN users o ON o.id=i.owner_id WHERE token_hash=? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>? AND o.role="admin" AND o.workspace_owner_id IS NULL');
            $q->execute([hash('sha256',$token),time()]); $invite=$q->fetch();
            $hasDevices=$pdo->prepare('SELECT 1 FROM devices WHERE user_id=? LIMIT 1');$hasDevices->execute([$user['id']]);
            if (!$invite || strtolower((string)$user['contact']) !== $invite['contact'] || (int)$invite['owner_id']===$user['id'] || $user['workspace_owner_id']!==null || $hasDevices->fetchColumn()) {
                throw new InvalidArgumentException('Undangan tidak valid, kedaluwarsa, atau akun sudah memiliki ruang budidaya.');
            }
            // Cannot turn an existing workspace owner into a viewer while leaving followers behind.
            $members=$pdo->prepare('SELECT 1 FROM users WHERE workspace_owner_id=? LIMIT 1');$members->execute([$user['id']]);
            if ($members->fetchColumn()) throw new InvalidArgumentException('Ruang ini masih memiliki anggota.');
            $pdo->prepare('UPDATE workspace_invitations SET accepted_at=? WHERE id=?')->execute([time(),$invite['id']]);
            $pdo->prepare('UPDATE users SET role="viewer",workspace_owner_id=? WHERE id=?')->execute([$invite['owner_id'],$user['id']]);
            AuditRepository::record($pdo,(int)$invite['owner_id'],null,'workspace.joined',['member_id'=>$user['id']]);
            $pdo->commit();
        } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    }

    public static function members(PDO $pdo,int $ownerId): array
    {
        $q=$pdo->prepare('SELECT id,name,role FROM users WHERE id=? OR workspace_owner_id=? ORDER BY id');
        $q->execute([$ownerId,$ownerId]);return $q->fetchAll();
    }

    public static function revoke(PDO $pdo,int $ownerId,int $memberId): bool
    {
        $pdo->beginTransaction();
        try {
            $q=$pdo->prepare('UPDATE users SET role="admin",workspace_owner_id=NULL WHERE id=? AND workspace_owner_id=?');
            $q->execute([$memberId,$ownerId]);$changed=$q->rowCount()===1;
            if ($changed) AuditRepository::record($pdo,$ownerId,null,'workspace.revoked',['member_id'=>$memberId]);
            $pdo->commit(); return $changed;
        } catch (Throwable $e) { if ($pdo->inTransaction()) $pdo->rollBack(); throw $e; }
    }
}
