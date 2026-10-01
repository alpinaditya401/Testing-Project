<?php
declare(strict_types=1);

final class DeviceRepository
{
    public static function allForUser(PDO $pdo, int $userId): array
    {
        $statement = $pdo->prepare(
            'SELECT id, name, location, online, aerator, feeder, auto_mode, last_seen
             FROM devices
             WHERE user_id = :user_id
             ORDER BY sort_order, id'
        );
        $statement->execute([':user_id' => $userId]);
        $devices = $statement->fetchAll();

        $readingStatement = $pdo->prepare(
            'SELECT ph, temperature, turbidity, simulation, created_at, provenance, source_session
             FROM sensor_readings
             WHERE device_id = :device_id
             ORDER BY created_at DESC, id DESC
             LIMIT 1'
        );

        foreach ($devices as &$device) {
            $readingStatement->execute([':device_id' => $device['id']]);
            $reading = $readingStatement->fetch() ?: null;
            $seen = $device['last_seen'] ? strtotime($device['last_seen']) : false;
            $device['online'] = (bool)$device['online'] && ProductPolicy::connection($seen===false?null:$seen,time())['state']==='online';
            if(ProductRepository::isProduct($pdo,$device['id'])) {
                $product=ProductRepository::onboarding($pdo,$userId,$device['id']);
                $device['connection']=$product['connection'];
                $device['online']=$product['connection']['state']==='online';
            }
            $device['aerator'] = (bool) $device['aerator'];
            $device['feeder'] = (bool) $device['feeder'];
            $device['auto'] = (bool) $device['auto_mode'];
            unset($device['auto_mode']);
            if ($reading !== null) {
                $reading['ph'] = (float) $reading['ph'];
                $reading['temperature'] = (float) $reading['temperature'];
                $reading['turbidity'] = (float) $reading['turbidity'];
                $reading['simulation'] = (bool) $reading['simulation'];
            }
            $device['latest_reading'] = $reading;
        }
        unset($device);

        return $devices;
    }

    public static function control(
        PDO $pdo,
        int $userId,
        string $deviceId,
        string $actuator,
        bool $value,
        ?string $requestId = null,
        int $duration = 8
    ): ?array {
        $columns = [
            'aerator' => 'aerator',
            'feeder' => 'feeder',
            'auto' => 'auto_mode',
        ];
        if (!isset($columns[$actuator])) {
            throw new InvalidArgumentException('Aktuator tidak didukung.');
        }

        $ownership = $pdo->prepare('SELECT 1 FROM devices WHERE id = :id AND user_id = :user_id');
        $ownership->execute([':id' => $deviceId, ':user_id' => $userId]);
        if (!$ownership->fetchColumn()) {
            return null;
        }

        OperationsRepository::expire($pdo);
        $pdo->beginTransaction();
        try {
            $command = $actuator === 'auto' ? null : OperationsRepository::enqueue($pdo,$userId,$deviceId,$actuator,$value,$actuator==='feeder'?$duration:0,$requestId??bin2hex(random_bytes(16)));
            $column = $columns[$actuator];
            $statement = $pdo->prepare(
                "UPDATE devices SET {$column} = :value, updated_at = :updated_at WHERE id = :id AND user_id = :user_id"
            );
            $statement->execute([
                ':value' => $value ? 1 : 0,
                ':updated_at' => gmdate('Y-m-d\\TH:i:s\\Z'),
                ':id' => $deviceId,
                ':user_id' => $userId,
            ]);
            AuditRepository::record($pdo, $userId, $deviceId, 'actuator.control', [
                'actuator' => $actuator,
                'value' => $value,
            ]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }

        foreach (self::allForUser($pdo, $userId) as $device) {
            if ($device['id'] === $deviceId) {
                $device['command'] = $command;
                return $device;
            }
        }
        return null;
    }

    public static function ingestReading(
        PDO $pdo,
        string $deviceId,
        float $ph,
        float $temperature,
        float $turbidity,
        bool $simulation,
        string $createdAt
    ): ?array {
        $deviceStatement = $pdo->prepare(
            'SELECT user_id FROM devices WHERE id = :id LIMIT 1'
        );
        $deviceStatement->execute([':id' => $deviceId]);
        $device = $deviceStatement->fetch();
        if (!$device) {
            return null;
        }

        $pdo->beginTransaction();
        try {
            $dto = ['time'=>$createdAt,'ph'=>$ph,'temperature'=>$temperature,'turbidity'=>$turbidity,'simulation'=>$simulation,'provenance'=>$simulation?'simulation':'device','source_session'=>null];
            $duplicate = $pdo->prepare('SELECT * FROM sensor_readings WHERE device_id=? AND created_at=?');
            $duplicate->execute([$deviceId, $createdAt]);
            if ($existing = $duplicate->fetch()) {
                if ((float)$existing['ph'] !== $ph || (float)$existing['temperature'] !== $temperature || (float)$existing['turbidity'] !== $turbidity || (bool)$existing['simulation'] !== $simulation) {
                    throw new InvalidArgumentException('Timestamp sudah memiliki pembacaan berbeda.');
                }
                $pdo->commit();
                return array_replace($dto,['provenance'=>$existing['provenance'],'source_session'=>$existing['source_session']]);
            }
            $previousQuery = $pdo->prepare('SELECT * FROM sensor_readings WHERE device_id=? AND provenance=? ORDER BY created_at DESC LIMIT 1');
            $previousQuery->execute([$deviceId, $simulation ? 'simulation' : 'device']);
            $previous = $previousQuery->fetch();
            $insert = $pdo->prepare(
                'INSERT INTO sensor_readings
                 (device_id, ph, temperature, turbidity, simulation, created_at)
                 VALUES (:device_id, :ph, :temperature, :turbidity, :simulation, :created_at)'
            );
            $insert->execute([
                ':device_id' => $deviceId,
                ':ph' => $ph,
                ':temperature' => $temperature,
                ':turbidity' => $turbidity,
                ':simulation' => $simulation ? 1 : 0,
                ':created_at' => $createdAt,
            ]);
            $readingId = (int)$pdo->lastInsertId();
            Provenance::mark($pdo,'sensor_readings',$readingId,$simulation?'simulation':'device');

            $update = $pdo->prepare(
                'UPDATE devices SET online = 1, last_seen = :last_seen, updated_at = :updated_at WHERE id = :id'
            );
            $update->execute([
                ':last_seen' => gmdate('Y-m-d\TH:i:s\Z'),
                ':updated_at' => gmdate('Y-m-d\\TH:i:s\\Z'),
                ':id' => $deviceId,
            ]);

            $thresholdQuery = $pdo->prepare('SELECT * FROM threshold_settings WHERE user_id = ?');
            $thresholdQuery->execute([(int) $device['user_id']]);
            $threshold = $thresholdQuery->fetch();
            $ruleVersionId = null;
            if ($threshold) {
                require_once __DIR__ . '/RuleVersionRepository.php';
                $ruleVersionId = RuleVersionRepository::record($pdo,(int)$device['user_id'],$readingId,$threshold);
            }
            if ($threshold && (!$previous || $createdAt > $previous['created_at'])) {
                $rules = [
                    ['ph', 'pH', $ph, (float)$threshold['ph_min'], (float)$threshold['ph_max'], 'Periksa kalibrasi sensor dan kondisi air sebelum koreksi pH.'],
                    ['temperature', 'Suhu', $temperature, (float)$threshold['temperature_min'], (float)$threshold['temperature_max'], 'Periksa sirkulasi dan kondisi suhu kolam.'],
                    ['turbidity', 'Kekeruhan', $turbidity, 0.0, (float)$threshold['turbidity_max'], 'Periksa endapan, filter, dan sisa pakan.'],
                ];
                foreach ($rules as [$key, $parameter, $value, $min, $max, $advice]) {
                    $priorBreach = $previous && ((float)$previous[$key] < $min || (float)$previous[$key] > $max);
                    if (($value < $min || $value > $max) && !$priorBreach) {
                        $alert = $pdo->prepare('INSERT INTO alerts (device_id,severity,message,created_at) VALUES (?, ?, ?, ?)');
                        $alert->execute([$deviceId, 'warning', "$parameter $value di luar ambang {$min}–{$max}. $advice Sumber: " . ($simulation ? 'simulasi' : 'telemetri; kalibrasi belum diverifikasi') . "; waktu $createdAt.", $createdAt]);
                        Provenance::mark($pdo,'alerts',(int)$pdo->lastInsertId(),$simulation?'simulation':'device');
                    }
                }
            }
            AuditRepository::record($pdo, (int) $device['user_id'], $deviceId, 'reading.ingested', [
                'rule_version_id' => $ruleVersionId,
                'provenance' => $simulation?'simulation':'device',
                'simulation' => $simulation,
                'created_at' => $createdAt,
            ]);
            $pdo->commit();
        } catch (Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $error;
        }

        return [
            'time' => $createdAt,
            'ph' => $ph,
            'temperature' => $temperature,
            'turbidity' => $turbidity,
            'simulation' => $simulation,
            'provenance'=>$simulation?'simulation':'device','source_session'=>null,
        ];
    }

    public static function readings(PDO $pdo, int $userId, string $deviceId, int $limit): ?array
    {
        $ownership = $pdo->prepare('SELECT 1 FROM devices WHERE id = :id AND user_id = :user_id');
        $ownership->execute([':id' => $deviceId, ':user_id' => $userId]);
        if (!$ownership->fetchColumn()) {
            return null;
        }

        $limit = max(1, min(100, $limit));
        $statement = $pdo->prepare(
            'SELECT ph, temperature, turbidity, simulation, created_at, provenance, source_session
             FROM sensor_readings
             WHERE device_id = :device_id
             ORDER BY created_at DESC, id DESC
             LIMIT :limit'
        );
        $statement->bindValue(':device_id', $deviceId, PDO::PARAM_STR);
        $statement->bindValue(':limit', $limit, PDO::PARAM_INT);
        $statement->execute();
        $rows = array_reverse($statement->fetchAll());

        return array_map(static fn (array $row): array => [
            'time' => $row['created_at'],
            'ph' => (float) $row['ph'],
            'temperature' => (float) $row['temperature'],
            'turbidity' => (float) $row['turbidity'],
            'simulation' => (bool) $row['simulation'],
            'provenance'=>$row['provenance'],'source_session'=>$row['source_session'],
        ], $rows);
    }
}
