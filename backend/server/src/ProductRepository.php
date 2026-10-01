<?php
declare(strict_types=1);
require_once __DIR__.'/ProductPolicy.php';

final class ProductError extends RuntimeException
{
    public function __construct(public string $errorCode,string $message,public int $status=422,public array $details=[]){parent::__construct($message);}
}

final class ProductRepository
{
    public static function migrate(PDO $pdo): void
    {
        $pdo->exec('CREATE TABLE IF NOT EXISTS seller_operators(user_id INTEGER PRIMARY KEY REFERENCES users(id), granted_at INTEGER NOT NULL)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS product_units(serial TEXT PRIMARY KEY REFERENCES device_inventory(serial_number), activation_hash TEXT NOT NULL UNIQUE, expires_at INTEGER NOT NULL, used_at INTEGER, key_hash TEXT NOT NULL, created_by INTEGER NOT NULL REFERENCES users(id), created_at INTEGER NOT NULL, first_heartbeat INTEGER, last_heartbeat INTEGER)');
        $pdo->exec('CREATE TABLE IF NOT EXISTS activation_attempts(user_id INTEGER NOT NULL REFERENCES users(id),serial TEXT NOT NULL,state_json TEXT NOT NULL,PRIMARY KEY(user_id,serial))');
    }

    public static function isProduct(PDO $pdo,string $serial): bool
    {
        $q=$pdo->prepare('SELECT 1 FROM product_units WHERE serial=?');$q->execute([$serial]);return (bool)$q->fetchColumn();
    }

    public static function seller(PDO $pdo,int $id): bool
    {
        $q=$pdo->prepare('SELECT 1 FROM seller_operators WHERE user_id=?');$q->execute([$id]);return (bool)$q->fetchColumn();
    }

    public static function inventory(PDO $pdo): array
    {
        return $pdo->query('SELECT p.serial,p.expires_at,p.used_at,p.created_at,i.default_name,i.default_location,i.claimed_user_id FROM product_units p JOIN device_inventory i ON i.serial_number=p.serial ORDER BY p.created_at DESC,p.serial')->fetchAll();
    }

    public static function provision(PDO $pdo,int $seller,array $body,?int $now=null,?callable $generator=null): array
    {
        if(!self::seller($pdo,$seller))throw new ProductError('seller_forbidden','Anda bukan operator penjual.',403);
        $serial=strtoupper(trim(is_string($body['serial_number']??null)?$body['serial_number']:''));
        $name=$body['name']??'';$location=$body['location']??'';
        if(!preg_match('/^[A-Z0-9_-]{1,128}$/D',$serial)||!is_string($name)||!is_string($location)||trim($name)===''||trim($location)===''||mb_strlen($name)>100||mb_strlen($location)>150)throw new ProductError('validation_error','Serial, nama atau lokasi tidak valid.');
        $dir=realpath(getenv('AQUASMART_DEVICE_HANDOFF_DIR')?:'');$web=realpath(dirname(__DIR__,2).'/web');
        if(!$dir||!is_dir($dir)||!is_writable($dir)||($web&&str_starts_with(strtolower($dir.DIRECTORY_SEPARATOR),strtolower($web.DIRECTORY_SEPARATOR))))throw new ProductError('handoff_unavailable','Direktori persiapan perangkat belum dikonfigurasi di luar web root.',503);
        $now??=time();$file=null;$pdo->exec('BEGIN IMMEDIATE');
        try {
            $q=$pdo->prepare('SELECT 1 FROM device_inventory WHERE serial_number=?');$q->execute([$serial]);
            if($q->fetchColumn())throw new ProductError('serial_exists','Serial sudah terdaftar. Gunakan serial unit lain.',409);
            $code=null;
            for($i=0;$i<ProductPolicy::config()['ACTIVATION_COLLISION_RETRIES'];$i++) {
                $candidate=($generator??[ProductPolicy::class,'activationCode'])();$normalized=ProductPolicy::normalizeCode($candidate);
                $q=$pdo->prepare('SELECT 1 FROM product_units WHERE activation_hash=?');$q->execute([hash('sha256',$normalized)]);
                if(!$q->fetchColumn()){$code=$candidate;break;}
            }
            if($code===null)throw new ProductError('activation_collision','Pembuatan kode unik gagal. Unit tidak disimpan.',503);
            $key=bin2hex(random_bytes(ProductPolicy::config()['DEVICE_KEY_BYTES']));
            $file=$dir.DIRECTORY_SEPARATOR.$serial.'.json';$stream=@fopen($file,'x');
            if(!$stream){$file=null;throw new ProductError('handoff_conflict','Artefak persiapan unit sudah ada atau tidak dapat dibuat.',409);}
            try {$contents=json_encode(['serial'=>$serial,'device_key'=>$key],JSON_THROW_ON_ERROR);if(fwrite($stream,$contents)!==strlen($contents))throw new RuntimeException('Secret handoff write failed');}finally{fclose($stream);}
            @chmod($file,0600);
            $expires=ProductPolicy::activationExpiry($now);
            $pdo->prepare('INSERT INTO device_inventory(serial_number,default_name,default_location) VALUES(?,?,?)')->execute([$serial,trim($name),trim($location)]);
            $pdo->prepare('INSERT INTO product_units(serial,activation_hash,expires_at,key_hash,created_by,created_at) VALUES(?,?,?,?,?,?)')->execute([$serial,hash('sha256',ProductPolicy::normalizeCode($code)),$expires,hash('sha256',$key),$seller,$now]);
            AuditRepository::record($pdo,$seller,null,'product.provisioned',['serial'=>$serial,'provenance'=>'manual']);
            $pdo->exec('COMMIT');
            return ['serial_number'=>$serial,'activation_code'=>$code,'expires_at'=>$expires,'state'=>'unclaimed'];
        }catch(Throwable $e){$pdo->exec('ROLLBACK');if($file!==null&&is_file($file))unlink($file);throw $e;}
    }

    public static function claim(PDO $pdo,int $owner,string $serial,string $code,?int $now=null): array
    {
        $serial=strtoupper(trim($serial));
        if(!preg_match('/^[A-Z0-9_-]{1,128}$/D',$serial))throw new ProductError('serial_not_found','Serial tidak ditemukan.',404);
        $now??=time();$pdo->exec('BEGIN IMMEDIATE');
        $failure=null;
        try {
            $q=$pdo->prepare('SELECT state_json FROM activation_attempts WHERE user_id=? AND serial=?');$q->execute([$owner,$serial]);$state=json_decode($q->fetchColumn()?:'{}',true);
            $retry=ProductPolicy::retryAfter($state,$now);
            if($retry>0)throw new ProductError('activation_locked','Terlalu banyak kode salah. Tunggu sebelum mencoba lagi.',429,['retry_after'=>$retry]);
            $q=$pdo->prepare('SELECT p.*,i.claimed_user_id,i.default_name,i.default_location FROM product_units p JOIN device_inventory i ON i.serial_number=p.serial WHERE p.serial=?');$q->execute([$serial]);$row=$q->fetch();
            if(!$row)$failure=new ProductError('serial_not_found','Serial tidak ditemukan.',404);
            elseif($row['claimed_user_id']!==null||$row['used_at']!==null)$failure=new ProductError('activation_used','Kode sudah dipakai; unit telah diklaim.',409);
            elseif(ProductPolicy::expired((int)$row['expires_at'],$now))$failure=new ProductError('activation_expired','Kode aktivasi kedaluwarsa. Hubungi penjual.',410);
            else {
                try{$normalized=ProductPolicy::normalizeCode($code);}catch(InvalidArgumentException){$normalized='';}
                if(!hash_equals($row['activation_hash'],hash('sha256',$normalized)))$failure=new ProductError('activation_invalid','Kode aktivasi salah. Cocokkan dengan label.');
            }
            if($failure) {
                $state=ProductPolicy::activationFailure($state,$now);
                $pdo->prepare('INSERT INTO activation_attempts(user_id,serial,state_json) VALUES(?,?,?) ON CONFLICT(user_id,serial) DO UPDATE SET state_json=excluded.state_json')->execute([$owner,$serial,json_encode($state,JSON_THROW_ON_ERROR)]);
                $pdo->exec('COMMIT');
            } else {
                $pdo->prepare('INSERT INTO devices(id,user_id,name,location,online,last_seen) VALUES(?,?,?,?,0,NULL)')->execute([$serial,$owner,$row['default_name'],$row['default_location']]);
                $pdo->prepare('UPDATE device_inventory SET claimed_user_id=?,claimed_at=? WHERE serial_number=? AND claimed_user_id IS NULL')->execute([$owner,gmdate('Y-m-d\TH:i:s\Z',$now),$serial]);
                $pdo->prepare('UPDATE product_units SET used_at=? WHERE serial=? AND used_at IS NULL')->execute([$now,$serial]);
                $pdo->prepare('INSERT INTO device_credentials(device_id,key_hash,rotated_at) VALUES(?,?,?)')->execute([$serial,$row['key_hash'],gmdate('Y-m-d\TH:i:s\Z',$now)]);
                $pdo->prepare('DELETE FROM activation_attempts WHERE user_id=? AND serial=?')->execute([$owner,$serial]);
                AuditRepository::record($pdo,$owner,$serial,'product.claimed',['provenance'=>'manual']);
                $pdo->exec('COMMIT');
                return ['id'=>$serial,'name'=>$row['default_name'],'state'=>'registered_pending_connection','connection'=>ProductPolicy::connection(null,$now)];
            }
        }catch(Throwable $e){$pdo->exec('ROLLBACK');throw $e;}
        throw $failure;
    }

    public static function onboarding(PDO $pdo,int $owner,string $serial,?int $now=null): array
    {
        $q=$pdo->prepare('SELECT d.id,d.name,d.location,p.last_heartbeat FROM devices d JOIN product_units p ON p.serial=d.id WHERE d.id=? AND d.user_id=?');$q->execute([$serial,$owner]);$row=$q->fetch();
        if(!$row)throw new ProductError('forbidden','Unit tidak ditemukan atau akun ini bukan pemiliknya.',403);
        $now??=time();$row['connection']=ProductPolicy::connection($row['last_heartbeat']===null?null:(int)$row['last_heartbeat'],$now);
        $row['state']=$row['connection']['state']==='waiting'?'registered_pending_connection':$row['connection']['state'];
        $row['server_now']=$now;$row['capabilities']=['wifi_provisioning'=>false,'physical_test'=>false];
        return $row;
    }

    public static function dashboard(PDO $pdo,int $owner,string $serial,?int $now=null): array
    {
        $now??=time();$unit=self::onboarding($pdo,$owner,$serial,$now);
        $q=$pdo->prepare('SELECT payload,received_at FROM device_telemetry WHERE device_id=? ORDER BY received_at DESC,id DESC LIMIT 100');$q->execute([$serial]);
        $history=[];
        foreach($q->fetchAll() as $row) {
            $reading=json_decode($row['payload'],true,flags:JSON_THROW_ON_ERROR);
            $stamp=strtotime($reading['created_at']);
            $history[]=['temperature'=>$reading['temperature'],'status'=>$reading['temperature_status'],'provenance'=>$reading['provenance'],'source_session'=>$reading['source_session'],'created_at'=>$reading['created_at'],'received_at'=>$row['received_at'],'freshness'=>ProductPolicy::reading($stamp===false?null:$stamp,$now)];
        }
        $unit['latest_reading']=$history[0]??null;$unit['temperature_history']=$history;
        OperationsRepository::expire($pdo,$now,$serial);
        $unit['commands']=OperationsRepository::allForDevice($pdo,$owner,$serial);
        $unit['feeder_limits']=['min'=>ProductPolicy::config()['FEEDER_MIN_SECONDS'],'max'=>ProductPolicy::config()['FEEDER_MAX_SECONDS']];
        return $unit;
    }
}
