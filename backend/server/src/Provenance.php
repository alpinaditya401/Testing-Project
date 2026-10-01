<?php
declare(strict_types=1);

final class Provenance
{
    public const SOURCES = ['simulation','device','manual','seed','legacy_unverified'];

    public static function counts(array $rows): array
    {
        $counts=array_fill_keys(self::SOURCES,0);
        foreach ($rows as $row) $counts[$row['provenance']??'legacy_unverified']++;
        return $counts;
    }

    public static function label(string $source): string
    {
        return match($source) {
            'simulation'=>'SIMULASI', 'device'=>'DEVICE / kalibrasi belum diverifikasi',
            'manual'=>'MANUAL', 'seed'=>'SEED / data contoh', default=>'LEGACY / UNVERIFIED'
        };
    }
    public static function migrate(PDO $pdo): void
    {
        $pdo->beginTransaction();
        try {
            foreach (['sensor_readings','alerts','actuator_commands','growth_observations','audit_logs'] as $table) {
                $columns = array_column($pdo->query("PRAGMA table_info($table)")->fetchAll(),'name');
                if (!in_array('provenance',$columns,true)) {
                    $pdo->exec("ALTER TABLE $table ADD COLUMN provenance TEXT NOT NULL DEFAULT 'legacy_unverified'");
                    $pdo->exec("ALTER TABLE $table ADD COLUMN source_session TEXT");
                }
            }
            $pdo->exec('CREATE TABLE IF NOT EXISTS device_telemetry (
                id INTEGER PRIMARY KEY, device_id TEXT NOT NULL REFERENCES devices(id),
                created_at TEXT NOT NULL, received_at TEXT NOT NULL,
                provenance TEXT NOT NULL CHECK(provenance IN (\'device\',\'simulation\')),
                simulation INTEGER NOT NULL, source_session TEXT NOT NULL, payload TEXT NOT NULL,
                UNIQUE(device_id,created_at)
            )');
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $error;
        }
    }

    public static function mark(PDO $pdo,string $table,int|string $id,string $source,?string $session=null): void
    {
        if (!in_array($table,['sensor_readings','alerts','actuator_commands','growth_observations','audit_logs'],true)
            || !in_array($source,['seed','simulation','manual','device','legacy_unverified'],true)) throw new InvalidArgumentException('Invalid provenance');
        $pdo->prepare("UPDATE $table SET provenance=?,source_session=? WHERE id=?")->execute([$source,$session,$id]);
    }
}
