<?php
declare(strict_types=1);
require_once __DIR__ . '/AuditRepository.php';
require_once __DIR__ . '/ProductPolicy.php';
/** Queue/ACK are transport evidence, not proof of physical actuation. */
final class OperationsRepository
{
    public static function migrate(PDO $pdo): void
    {
        $pdo->exec('CREATE TABLE IF NOT EXISTS actuator_commands (
            id TEXT PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(id), user_id INTEGER NOT NULL REFERENCES users(id),
            actuator TEXT NOT NULL, value INTEGER NOT NULL, duration INTEGER NOT NULL,
            request_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT "pending", simulation INTEGER NOT NULL DEFAULT 1,
            created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, delivered_at INTEGER, completed_at INTEGER,
            UNIQUE(device_id,request_id)
        )');
        $pdo->exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_single_inflight_actuator ON actuator_commands(device_id,actuator) WHERE status IN ("pending","delivered")');
    }
    public static function expire(PDO $pdo, ?int $now=null, ?string $deviceId=null): void
    {
        $now??=time();
        $own = !$pdo->inTransaction();
        if ($own) $pdo->beginTransaction();
        try {
            $query = $pdo->prepare('SELECT * FROM actuator_commands WHERE status IN ("pending","delivered") AND expires_at<=?' . ($deviceId===null?'':' AND device_id=?'));
            $query->execute($deviceId===null?[$now]:[$now,$deviceId]);
            foreach ($query->fetchAll() as $row) {
                $pdo->prepare('UPDATE actuator_commands SET status="timeout",completed_at=? WHERE id=?')->execute([$now,$row['id']]);
                if ($row['actuator'] === 'feeder') $pdo->prepare('UPDATE devices SET feeder=0 WHERE id=?')->execute([$row['device_id']]);
                AuditRepository::record($pdo, (int)$row['user_id'], $row['device_id'], 'command.timeout', ['command_id'=>$row['id'], 'simulation'=>(bool)$row['simulation'], 'provenance'=>$row['provenance']??'legacy_unverified']);
            }
            if ($own) $pdo->commit();
        } catch (Throwable $error) {
            if ($own && $pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }

    public static function poll(PDO $pdo,string $deviceId,?int $now=null,bool $simulation=true): array
    {
        $now??=time();self::expire($pdo,$now,$deviceId);$pdo->beginTransaction();
        try {
            $statuses=$simulation?'status="pending"':'status IN ("pending","delivered")';
            $q=$pdo->prepare('SELECT * FROM actuator_commands WHERE device_id=? AND '.$statuses.' AND simulation=? ORDER BY created_at,id');$q->execute([$deviceId,$simulation?1:0]);$rows=$q->fetchAll();
            foreach($rows as &$row){
                if ($row['status']==='delivered') continue;
                $row['status']='delivered';$row['delivered_at']=$now;$row['expires_at']=ProductPolicy::commandExpiry((int)$row['created_at'],$now,(int)$row['duration']);
                $pdo->prepare('UPDATE actuator_commands SET status="delivered",delivered_at=?,expires_at=? WHERE id=? AND status="pending"')->execute([$now,$row['expires_at'],$row['id']]);
                AuditRepository::record($pdo, (int)$row['user_id'], $deviceId, 'command.delivered', ['command_id'=>$row['id'], 'simulation'=>$simulation,'provenance'=>$row['provenance']??'legacy_unverified','source_session'=>$row['source_session']??null]);
            }
            unset($row);
            $pdo->commit();return array_map([self::class,'dto'],$rows);
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }

    public static function acknowledge(PDO $pdo,string $deviceId,string $id,string $status,?int $now=null,bool $simulation=true): array
    {
        $now??=time();self::expire($pdo,$now,$deviceId);
        if(!in_array($status,['succeeded','failed','timeout'],true))throw new InvalidArgumentException('Status ACK tidak valid.');
        $pdo->beginTransaction();
        try {
            $q=$pdo->prepare('SELECT * FROM actuator_commands WHERE id=? AND device_id=? AND simulation=?');$q->execute([$id,$deviceId,$simulation?1:0]);$row=$q->fetch();
            if(!$row)throw new DomainException('Perintah tidak ditemukan pada perangkat ini.');
            if($row['status']===$status){$pdo->commit();return self::dto($row);}
            if($row['status']!=='delivered')throw new DomainException('ACK hanya diterima untuk perintah yang sudah dikirim dan belum selesai.');
            $pdo->prepare('UPDATE actuator_commands SET status=?,completed_at=? WHERE id=?')->execute([$status,$now,$id]);
            AuditRepository::record($pdo, (int)$row['user_id'], $deviceId, 'command.' . $status, ['command_id'=>$id, 'simulation'=>$simulation,'provenance'=>$row['provenance']??'legacy_unverified','source_session'=>$row['source_session']??null]);
            // Reported feeder state stops on terminal result; no claim about physical hardware.
            if($row['actuator']==='feeder')$pdo->prepare('UPDATE devices SET feeder=0 WHERE id=?')->execute([$deviceId]);
            $row['status']=$status;$row['completed_at']=$now;$pdo->commit();return self::dto($row);
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
    }

    public static function allForDevice(PDO $pdo,int $owner,string $deviceId): ?array
    {
        $q=$pdo->prepare('SELECT 1 FROM devices WHERE id=? AND user_id=?');$q->execute([$deviceId,$owner]);if(!$q->fetchColumn())return null;
        $q=$pdo->prepare('SELECT * FROM actuator_commands WHERE device_id=? ORDER BY created_at DESC,id DESC LIMIT 100');$q->execute([$deviceId]);return array_map([self::class,'dto'],$q->fetchAll());
    }

    public static function feedingLogs(PDO $pdo,int $owner,string $deviceId): ?array
    {
        $rows=self::allForDevice($pdo,$owner,$deviceId);
        return $rows===null?null:array_values(array_filter($rows,fn($r)=>$r['actuator']==='feeder'&&in_array($r['status'],['succeeded','failed','timeout'],true)));
    }

    public static function tick(PDO $pdo,DateTimeImmutable $now): array
    {
        $clock=$now->setTimezone(new DateTimeZone(getenv('AQUASMART_TIMEZONE')?:'Asia/Jakarta'));
        self::expire($pdo,$now->getTimestamp());
        $q=$pdo->prepare('SELECT s.*,d.user_id FROM feeding_schedules s JOIN devices d ON d.id=s.device_id WHERE s.active=1 AND d.auto_mode=1 AND s.time=? ORDER BY s.id');$q->execute([$clock->format('H:i')]);$out=[];
        foreach($q->fetchAll() as $schedule){
            $weekend=(int)$clock->format('N')>=6;
            if(($schedule['days']==='Senin - Jumat'&&$weekend)||($schedule['days']==='Akhir pekan'&&!$weekend))continue;
            $request='schedule:'.$schedule['id'].':'.$clock->format('Y-m-d');
            try{$out[]=self::enqueue($pdo,(int)$schedule['user_id'],$schedule['device_id'],'feeder',true,(int)$schedule['duration'],$request,$now->getTimestamp(),'scheduler');}
            catch(DomainException $e){$out[]=['schedule_id'=>$schedule['id'],'status'=>'skipped_busy'];}
        }
        return $out;
    }

    private static function dto(array $row): array
    {
        $row['value']=(bool)$row['value'];$row['simulation']=(bool)$row['simulation'];$row['duration']=(int)$row['duration'];return $row;
    }
    public static function enqueue(PDO $pdo,int $userId,string $deviceId,string $actuator,bool $value,int $duration,string $requestId,?int $now=null,string $source='manual',bool $simulation=true): ?array
    {
        $q=$pdo->prepare('SELECT 1 FROM devices WHERE id=? AND user_id=?');$q->execute([$deviceId,$userId]);if(!$q->fetchColumn())return null;
        if (!in_array($actuator,['feeder','aerator','auto','pump'],true) || ($actuator==='feeder' && ($duration<1||$duration>30)) || ($actuator!=='feeder' && $duration!==0) || !preg_match('/^[A-Za-z0-9:_.-]{1,120}$/D',$requestId)) throw new InvalidArgumentException('Perintah atau durasi tidak valid.');
        $now??=time(); $own=!$pdo->inTransaction();if($own)$pdo->beginTransaction();
        try {
            $q=$pdo->prepare('SELECT * FROM actuator_commands WHERE device_id=? AND request_id=?');$q->execute([$deviceId,$requestId]);
            if($row=$q->fetch()){
                if($row['actuator']!==$actuator || (bool)$row['value']!==$value || (int)$row['duration']!==$duration || (bool)$row['simulation']!==$simulation)throw new DomainException('Request ID sudah dipakai untuk perintah berbeda.');
                if($own)$pdo->commit();return self::dto($row);
            }
            $q=$pdo->prepare('SELECT 1 FROM actuator_commands WHERE device_id=? AND actuator=? AND status IN ("pending","delivered")');$q->execute([$deviceId,$actuator]);if($q->fetchColumn())throw new DomainException('Aktuator masih memiliki perintah aktif.');
            $id=bin2hex(random_bytes(16));$q=$pdo->prepare('INSERT INTO actuator_commands(id,device_id,user_id,actuator,value,duration,request_id,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)');
            $q->execute([$id,$deviceId,$userId,$actuator,$value?1:0,$duration,$requestId,$now,ProductPolicy::commandExpiry($now,null,$duration)]);
            $pdo->prepare('UPDATE actuator_commands SET simulation=? WHERE id=?')->execute([$simulation?1:0,$id]);
            if (class_exists('Provenance')) Provenance::mark($pdo,'actuator_commands',$id,$simulation?'simulation':'device');
            AuditRepository::record($pdo, $userId, $deviceId, 'command.queued', ['command_id'=>$id, 'simulation'=>$simulation, 'source'=>$source,'provenance'=>$simulation?'simulation':'device']);
            $q=$pdo->prepare('SELECT * FROM actuator_commands WHERE id=?');$q->execute([$id]);$row=$q->fetch();if($own)$pdo->commit();return self::dto($row);
        } catch(Throwable $e){if($own&&$pdo->inTransaction())$pdo->rollBack();throw $e;}
    }
}
