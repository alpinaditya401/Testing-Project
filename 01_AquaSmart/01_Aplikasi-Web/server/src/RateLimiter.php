<?php
declare(strict_types=1);
final class RateLimiter
{
    /** Count this request and refuse once the bucket is over $limit. */
    public static function check(PDO $pdo,string $route,int $limit,int $windowSeconds=60): void
    {
        $bucket=self::hit($pdo,$route,$windowSeconds);
        if($bucket['hits']>$limit)self::refuse($bucket['expires_at']);
    }

    /** Refuse without counting when earlier hits already reached $limit (count failures with hit()). */
    public static function guard(PDO $pdo,string $route,int $limit): void
    {
        self::migrate($pdo);
        $q=$pdo->prepare('SELECT hits,expires_at FROM api_rate_limits WHERE bucket=? AND expires_at>?');$q->execute([self::bucket($route),time()]);$row=$q->fetch();
        if($row&&(int)$row['hits']>=$limit)self::refuse((int)$row['expires_at']);
    }

    /** @return array{hits:int,expires_at:int} */
    public static function hit(PDO $pdo,string $route,int $windowSeconds=60): array
    {
        self::migrate($pdo);
        $now=time();$key=self::bucket($route);
        $pdo->beginTransaction();
        try {
            $pdo->prepare('DELETE FROM api_rate_limits WHERE expires_at<=?')->execute([$now]);
            $pdo->prepare('INSERT INTO api_rate_limits(bucket,hits,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1')->execute([$key,$now+$windowSeconds]);
            $q=$pdo->prepare('SELECT hits,expires_at FROM api_rate_limits WHERE bucket=?');$q->execute([$key]);$bucket=$q->fetch();$pdo->commit();
        }catch(Throwable $e){if($pdo->inTransaction())$pdo->rollBack();throw $e;}
        return ['hits'=>(int)$bucket['hits'],'expires_at'=>(int)$bucket['expires_at']];
    }

    /**
     * Who is asking. Behind the Next.js BFF every browser request arrives from the
     * BFF's address, so one bucket would be shared by every user. When
     * AQUASMART_PROXY_SECRET (16+ characters) is configured on both sides, the BFF
     * proves itself with X-AquaSmart-Proxy-Secret and reports the browser's IP in
     * X-AquaSmart-Client-IP. Without a matching secret those headers are ignored.
     */
    public static function client(): string
    {
        $secret=(string)(getenv('AQUASMART_PROXY_SECRET')?:'');
        $given=(string)($_SERVER['HTTP_X_AQUASMART_PROXY_SECRET']??'');
        $ip=trim((string)($_SERVER['HTTP_X_AQUASMART_CLIENT_IP']??''));
        if(strlen($secret)>=16&&hash_equals($secret,$given)&&filter_var($ip,FILTER_VALIDATE_IP)!==false)return $ip;
        return (string)($_SERVER['REMOTE_ADDR']??'local');
    }

    private static function bucket(string $route): string
    {
        return hash('sha256',self::client().'|'.$route);
    }

    private static function migrate(PDO $pdo): void
    {
        $pdo->exec('CREATE TABLE IF NOT EXISTS api_rate_limits (bucket TEXT PRIMARY KEY, hits INTEGER NOT NULL, expires_at INTEGER NOT NULL)');
    }

    private static function refuse(int $expiresAt): never
    {
        header('Retry-After: '.max(1,$expiresAt-time()));
        Http::error('rate_limited','Terlalu banyak permintaan. Coba lagi sesudah jeda.',429);
    }
}
