<?php
declare(strict_types=1);
require_once __DIR__ . '/AuditRepository.php';

final class TelemetryRepository
{
    public static function ingest(PDO $pdo,string $device,array $body): array
    {
        $stamp=$body['created_at']??null;
        if (!is_string($stamp) || !preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})Z$/D',$stamp,$m)
            || !checkdate((int)$m[2],(int)$m[3],(int)$m[1]) || (int)$m[4]>23 || (int)$m[5]>59 || (int)$m[6]>59) throw new InvalidArgumentException('Timestamp UTC tidak valid.');
        if (strtotime($stamp) > time() + 300) throw new InvalidArgumentException('Timestamp lebih dari 5 menit di masa depan. Periksa jam perangkat.');
        $simulation=$body['simulation']??null;
        $source=$body['provenance']??null;
        $session=$body['source_session']??null;
        if (!is_bool($simulation) || $source!==($simulation?'simulation':'device') || !is_string($session)
            || !preg_match('/^[A-Za-z0-9_-]{8,64}$/D',$session)) throw new InvalidArgumentException('Provenance atau source_session tidak valid.');
        $temperature=$body['temperature']??null;
        $temperatureStatus=$body['temperature_status']??null;
        if (!in_array($temperatureStatus,['ok','disconnected','unverified'],true)
            || ($temperatureStatus==='ok' ? !self::number($temperature,-55,125) : $temperature!==null)) throw new InvalidArgumentException('Status suhu tidak sesuai pengukuran.');
        foreach (['turbidity','soil_ph'] as $prefix) {
            $adc=$body[$prefix.'_adc']??null; $mv=$body[$prefix.'_mv']??null;
            if ($adc!==null && (!is_int($adc)||$adc<0||$adc>4095)) throw new InvalidArgumentException('ADC harus 0–4095 atau null.');
            if (($adc===null)!==($mv===null) || ($mv!==null&&!self::number($mv,0,3300))) throw new InvalidArgumentException('Tegangan ADC tidak valid.');
        }
        $sensorMv=$body['turbidity_sensor_mv']??null;
        $mapping=$body['turbidity_mapping_percent']??null;
        $mv=$body['turbidity_mv']??null;
        if ($mv===null ? ($sensorMv!==null||$mapping!==null) :
            (!self::number($sensorMv,0,5500)||abs($sensorMv-$mv/0.6)>2||!self::number($mapping,0,100))) throw new InvalidArgumentException('Rekonstruksi divider/mapping tidak valid.');
        if (($body['calibrated']??null)!==false || ($body['ph_sensor']??null)!=='soil_placeholder') throw new InvalidArgumentException('Kontrak ini hanya menerima sensor belum terkalibrasi dan pH tanah placeholder.');
        $normalized=['created_at'=>$stamp,'provenance'=>$source,'simulation'=>$simulation,'source_session'=>$session,
            'temperature'=>$temperature,'temperature_status'=>$temperatureStatus,
            'turbidity_adc'=>$body['turbidity_adc']??null,'turbidity_mv'=>$mv,'turbidity_sensor_mv'=>$sensorMv,
            'turbidity_mapping_percent'=>$mapping,'soil_ph_adc'=>$body['soil_ph_adc']??null,'soil_ph_mv'=>$body['soil_ph_mv']??null,
            'ph_sensor'=>'soil_placeholder','calibrated'=>false];
        $json=json_encode($normalized,JSON_THROW_ON_ERROR|JSON_PRESERVE_ZERO_FRACTION);
        $pdo->beginTransaction();
        try {
            $owner=$pdo->prepare('SELECT user_id FROM devices WHERE id=?');$owner->execute([$device]);$ownerId=$owner->fetchColumn();
            if ($ownerId===false) throw new DomainException('Perangkat tidak ditemukan.');
            $query=$pdo->prepare('SELECT payload FROM device_telemetry WHERE device_id=? AND created_at=?');$query->execute([$device,$stamp]);
            if ($old=$query->fetchColumn()) {
                if (json_decode($old,true)!=$normalized) throw new DomainException('Timestamp sudah memiliki telemetry berbeda.');
                $pdo->commit();return $normalized;
            }
            $now=gmdate('Y-m-d\TH:i:s\Z');
            $pdo->prepare('INSERT INTO device_telemetry(device_id,created_at,received_at,provenance,simulation,source_session,payload) VALUES(?,?,?,?,?,?,?)')
                ->execute([$device,$stamp,$now,$source,$simulation?1:0,$session,$json]);
            $pdo->prepare('UPDATE devices SET last_seen=?,online=1 WHERE id=?')->execute([$now,$device]);
            AuditRepository::record($pdo,(int)$ownerId,$device,'telemetry.received',['provenance'=>$source,'source_session'=>$session,'created_at'=>$stamp,'calibrated'=>false]);
            $pdo->commit();return $normalized;
        } catch (Throwable $error) {if($pdo->inTransaction())$pdo->rollBack();throw $error;}
    }

    public static function recent(PDO $pdo,int $owner,string $device): ?array
    {
        $query=$pdo->prepare('SELECT 1 FROM devices WHERE id=? AND user_id=?');$query->execute([$device,$owner]);
        if (!$query->fetchColumn()) return null;
        $query=$pdo->prepare('SELECT payload,received_at FROM device_telemetry WHERE device_id=? ORDER BY created_at DESC LIMIT 100');$query->execute([$device]);
        return array_map(static fn(array $row)=>json_decode($row['payload'],true)+['received_at'=>$row['received_at']],$query->fetchAll());
    }

    private static function number(mixed $value,float $min,float $max): bool
    {
        return (is_int($value)||is_float($value))&&is_finite((float)$value)&&$value>=$min&&$value<=$max;
    }
}
