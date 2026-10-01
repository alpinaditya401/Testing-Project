<?php
declare(strict_types=1);

final class ProductPolicy
{
    public static function config(): array
    {
        static $config;
        return $config ??= require dirname(__DIR__) . '/config/product.php';
    }

    public static function connection(?int $receivedAt, int $now): array
    {
        if ($receivedAt === null) return ['state'=>'waiting','age_seconds'=>null,'clock_anomaly'=>false];
        $age=$now-$receivedAt;
        return ['state'=>$age>=0 && $age<=self::config()['HEARTBEAT_FRESH_SECONDS']?'online':'offline',
            'age_seconds'=>$age,'clock_anomaly'=>$age<0];
    }

    public static function reading(?int $sampledAt, int $now): array
    {
        if ($sampledAt===null) return ['state'=>'missing','age_seconds'=>null,'relative'=>'Belum ada data'];
        $age=$now-$sampledAt;
        $state=$age<0?'clock_skew':($age<=self::config()['READING_FRESH_SECONDS']?'fresh':'stale');
        $label=match(true) {
            $age<0 => 'Waktu perangkat tidak sesuai',
            $age<60 => $age.' detik lalu',
            $age<3600 => intdiv($age,60).' menit lalu',
            $age<86400 => intdiv($age,3600).' jam lalu',
            default => intdiv($age,86400).' hari lalu',
        };
        return ['state'=>$state,'age_seconds'=>$age,'relative'=>$label];
    }

    public static function commandExpiry(int $createdAt, ?int $deliveredAt, int $duration): int
    {
        $c=self::config();
        return $deliveredAt===null?$createdAt+$c['COMMAND_PENDING_SECONDS']:
            $deliveredAt+max($c['COMMAND_ACK_MIN_SECONDS'],$duration+$c['COMMAND_ACK_GRACE_SECONDS']);
    }

    public static function expired(int $expiresAt, int $now): bool { return $now >= $expiresAt; }

    public static function feederDuration(mixed $value): int
    {
        $c=self::config();
        if (!is_int($value) || $value<$c['FEEDER_MIN_SECONDS'] || $value>$c['FEEDER_MAX_SECONDS']) {
            throw new InvalidArgumentException('Durasi harus bilangan bulat '.$c['FEEDER_MIN_SECONDS'].'–'.$c['FEEDER_MAX_SECONDS'].' detik.');
        }
        return $value;
    }

    public static function activationCode(): string
    {
        $c=self::config();$code='';$last=strlen($c['ACTIVATION_ALPHABET'])-1;
        for($i=0;$i<$c['ACTIVATION_LENGTH'];$i++) $code.=$c['ACTIVATION_ALPHABET'][random_int(0,$last)];
        return implode('-',str_split($code,$c['ACTIVATION_GROUP_LENGTH']));
    }

    public static function normalizeCode(string $value): string
    {
        $code=strtoupper(str_replace([' ','-'],'',$value));$c=self::config();
        if (strlen($code)!==$c['ACTIVATION_LENGTH'] || strspn($code,$c['ACTIVATION_ALPHABET'])!==strlen($code)) {
            throw new InvalidArgumentException('Format kode aktivasi tidak valid.');
        }
        return $code;
    }

    public static function activationExpiry(int $issuedAt): int { return $issuedAt+self::config()['ACTIVATION_TTL_SECONDS']; }

    public static function activationFailure(array $state, int $now): array
    {
        $c=self::config();
        if (!isset($state['window_start']) || $now >= $state['window_start']+$c['ACTIVATION_LOCK_SECONDS']) {
            $state=['window_start'=>$now,'failures'=>0,'locked_until'=>null];
        }
        $state['failures']++;
        if($state['failures'] >= $c['ACTIVATION_MAX_FAILURES']) $state['locked_until']=$state['window_start']+$c['ACTIVATION_LOCK_SECONDS'];
        return $state;
    }

    public static function retryAfter(array $state, int $now): int { return max(0,($state['locked_until']??0)-$now); }

    // Caller must persist this transition and the outbox insert atomically.
    public static function notification(array $state, bool $breach, int $now): array
    {
        $state+=['armed'=>true,'last_sent'=>null,'recovery_since'=>null];$send=false;$c=self::config();
        if ($breach) {
            $state['recovery_since']=null;
            if ($state['armed'] && ($state['last_sent']===null || $now-$state['last_sent'] >= $c['PUSH_MIN_INTERVAL_SECONDS'])) {
                $send=true;$state['armed']=false;$state['last_sent']=$now;
            }
        } else {
            $state['recovery_since']??=$now;
            if ($now-$state['recovery_since'] >= $c['PUSH_RECOVERY_SECONDS']) $state['armed']=true;
        }
        return ['send'=>$send,'state'=>$state];
    }

    public static function localClock(int $now): DateTimeImmutable
    {
        return (new DateTimeImmutable('@'.$now))->setTimezone(new DateTimeZone(self::config()['SCHEDULE_TIMEZONE']));
    }

    public static function occurrenceKey(string $scheduleId, int $now): string
    {
        return $scheduleId.':'.self::localClock($now)->format('Y-m-d');
    }

    public static function minute(string $time): int
    {
        if (!preg_match('/^([01][0-9]|2[0-3]):([0-5][0-9])$/D',$time,$m)) throw new InvalidArgumentException('Jam harus HH:mm WIB.');
        return (int)$m[1]*60+(int)$m[2];
    }

    public static function pumpWindow(string $start, string $end, int $now): bool
    {
        $a=self::minute($start);$b=self::minute($end);
        if ($a===$b) throw new InvalidArgumentException('Awal dan akhir jadwal tidak boleh sama.');
        $m=self::minute(self::localClock($now)->format('H:i'));
        return $a<$b?($m>=$a&&$m<$b):($m>=$a||$m<$b);
    }
}
