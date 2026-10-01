<?php
declare(strict_types=1);
final class ObservationRepository
{
    public static function migrate(PDO $pdo): void
    {
        $pdo->exec('CREATE TABLE IF NOT EXISTS growth_observations (
            id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
            device_id TEXT NOT NULL REFERENCES devices(id), observed_at TEXT NOT NULL,
            weight_g REAL, length_cm REAL, notes TEXT NOT NULL, created_at TEXT NOT NULL
        )');
    }
    public static function all(PDO $pdo,int $ownerId): array
    {
        $q=$pdo->prepare('SELECT * FROM growth_observations WHERE user_id=? ORDER BY observed_at DESC,id DESC LIMIT 200');$q->execute([$ownerId]);return $q->fetchAll();
    }
    public static function create(PDO $pdo,int $ownerId,array $body): ?array
    {
        $utc = new DateTimeZone('UTC');
        $date=$body['observed_at']??'';$parsed=is_string($date)?DateTimeImmutable::createFromFormat('!Y-m-d',$date,$utc):false;
        $notes=trim((string)($body['notes']??''));$weight=$body['weight_g']??null;$length=$body['length_cm']??null;
        if (!$parsed || $parsed->format('Y-m-d')!==$date || $parsed>new DateTimeImmutable('today',$utc) || mb_strlen($notes)>2000) throw new InvalidArgumentException('Tanggal UTC atau catatan tidak valid.');
        foreach ([$weight,$length] as $value) if ($value!==null && (!is_numeric($value) || !is_finite((float)$value) || (float)$value<=0)) throw new InvalidArgumentException('Ukuran harus angka positif atau kosong.');
        if ($weight===null && $length===null && $notes==='') throw new InvalidArgumentException('Isi pengukuran atau catatan observasi.');
        $q=$pdo->prepare('SELECT 1 FROM devices WHERE id=? AND user_id=?');$device=(string)($body['device_id']??'');$q->execute([$device,$ownerId]);if(!$q->fetchColumn())return null;
        $pdo->beginTransaction();
        try {
            $q=$pdo->prepare('INSERT INTO growth_observations(user_id,device_id,observed_at,weight_g,length_cm,notes,created_at) VALUES(?,?,?,?,?,?,?)');
            $q->execute([$ownerId,$device,$date,$weight===null?null:(float)$weight,$length===null?null:(float)$length,$notes,gmdate('c')]);$id=(int)$pdo->lastInsertId();
            Provenance::mark($pdo,'growth_observations',$id,'manual');
            AuditRepository::record($pdo,$ownerId,$device,'growth.created',['observation_id'=>$id,'source'=>'manual']);$pdo->commit();
            $q=$pdo->prepare('SELECT * FROM growth_observations WHERE id=?');$q->execute([$id]);return $q->fetch();
        } catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
    public static function delete(PDO $pdo,int $ownerId,int $id): bool
    {
        $pdo->beginTransaction();
        try {
            $q=$pdo->prepare('SELECT device_id FROM growth_observations WHERE id=? AND user_id=?');$q->execute([$id,$ownerId]);$device=$q->fetchColumn();
            if($device===false){$pdo->rollBack();return false;}
            $pdo->prepare('DELETE FROM growth_observations WHERE id=? AND user_id=?')->execute([$id,$ownerId]);
            AuditRepository::record($pdo,$ownerId,$device,'growth.deleted',['observation_id'=>$id]);$pdo->commit();return true;
        } catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
}
