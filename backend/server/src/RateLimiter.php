<?php
declare(strict_types=1);
final class RateLimiter
{
    public static function check(PDO $pdo,string $route,int $limit,int $windowSeconds=60): void
    {
        $pdo->exec('CREATE TABLE IF NOT EXISTS api_rate_limits (bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL)');
        $now=time();$key=hash('sha256',($_SERVER['REMOTE_ADDR']??'local').'|'.$route);
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM api_rate_limits WHERE expires_at<=?')->execute([$now]);
            $pdo->prepare('INSERT INTO api_rate_limits(bucket,hits,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1')->execute([$key,$now+$windowSeconds]);
            $q=$pdo->prepare('SELECT hits,expires_at FROM api_rate_limits WHERE bucket=?');$q->execute([$key]);$bucket=$q->fetch();$hits=(int)$bucket['hits'];$pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        if($hits>$limit){header('Retry-After: '.max(1,(int)$bucket['expires_at']-$now));Http::error('rate_limited','Terlalu banyak permintaan. Coba lagi sesudah jeda.',429);}
    }
}
