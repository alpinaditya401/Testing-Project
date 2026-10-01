<?php
declare(strict_types=1);
require_once __DIR__ . '/ThresholdRules.php';

final class RuleVersionRepository
{
    public static function record(PDO $pdo, int $owner, int $readingId, array $threshold): string
    {
        $config = [];
        foreach (['ph_min','ph_max','temperature_min','temperature_max','turbidity_max'] as $field) {
            $config[$field] = (float)$threshold[$field];
        }
        $json = json_encode($config, JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION);
        $id = hash('sha256', $owner . ':' . ThresholdRules::VERSION . ':' . $json);
        $pdo->prepare('INSERT OR IGNORE INTO rule_versions(id,user_id,version,config_json,created_at) VALUES(?,?,?,?,?)')
            ->execute([$id,$owner,ThresholdRules::VERSION,$json,gmdate('Y-m-d\TH:i:s\Z')]);
        $pdo->prepare('INSERT INTO reading_rule_versions(reading_id,rule_id) VALUES(?,?)')->execute([$readingId,$id]);
        return $id;
    }

    public static function all(PDO $pdo, int $owner): array
    {
        $query = $pdo->prepare('SELECT v.*, COUNT(r.reading_id) AS reading_count FROM rule_versions v
            LEFT JOIN reading_rule_versions r ON r.rule_id=v.id WHERE v.user_id=?
            GROUP BY v.id ORDER BY v.created_at DESC,v.id LIMIT 100');
        $query->execute([$owner]);
        return array_map(static function(array $row): array {
            $row['config'] = json_decode($row['config_json'],true,512,JSON_THROW_ON_ERROR);
            unset($row['config_json'],$row['user_id']);
            return $row;
        },$query->fetchAll());
    }
}
