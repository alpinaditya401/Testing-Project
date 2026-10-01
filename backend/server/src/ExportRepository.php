<?php
declare(strict_types=1);
require_once __DIR__ . '/ReportsRepository.php';
require_once __DIR__ . '/TelemetryRepository.php';

final class ExportRepository
{
    public static function build(PDO $pdo, int $owner, array $query): ?array
    {
        $device = $query['device_id'] ?? '';
        $kind = $query['kind'] ?? 'readings';
        $period = $query['period'] ?? 'day';
        $date = $query['date'] ?? '';
        if (!is_string($device) || !preg_match('/^[A-Za-z0-9_-]{1,128}$/D', $device)
            || !is_string($kind) || !in_array($kind,['readings','alerts','commands','feeding_logs','reports','telemetry'],true)
            || !is_string($period) || !in_array($period,['day','week','month'],true)
            || !is_string($date) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/D',$date,$parts)
            || !checkdate((int)$parts[2],(int)$parts[3],(int)$parts[1])) {
            throw new InvalidArgumentException('Filter ekspor tidak valid. Pilih perangkat, jenis data, tanggal, dan periode.');
        }
        $ownership = $pdo->prepare('SELECT 1 FROM devices WHERE id=? AND user_id=?');
        $ownership->execute([$device,$owner]);
        if (!$ownership->fetchColumn()) return null;
        $start = new DateTimeImmutable($date,new DateTimeZone('UTC'));
        if ($period === 'week') $start = $start->modify('-'.((int)$start->format('N')-1).' days');
        if ($period === 'month') $start = $start->modify('first day of this month');
        $end = $start->modify($period==='month'?'+1 month':($period==='week'?'+7 days':'+1 day'));
        if ((int)$end->format('Y')>9999) throw new InvalidArgumentException('Periode melampaui rentang kalender.');
        $meta = ['device_id'=>$device,'kind'=>$kind,'period'=>$period,'date'=>$date,'timezone'=>'UTC',
                 'start_at'=>$start->format('Y-m-d\TH:i:s\Z'),'end_at_exclusive'=>$end->format('Y-m-d\TH:i:s\Z'),
                 'hardware_verified'=>false];
        if ($kind === 'reports') {
            $report = ReportsRepository::forDevice($pdo,$owner,$device,$period,$date);
            return ['meta'=>$meta+['source_counts'=>$report['source_counts']],'rows'=>$report['groups']];
        }
        $table = match($kind) {'readings'=>'sensor_readings','alerts'=>'alerts','telemetry'=>'device_telemetry',default=>'actuator_commands'};
        $fields = match($kind) {
            'readings'=>'r.id,r.device_id,r.created_at,r.ph,r.temperature,r.turbidity,r.simulation',
            'alerts'=>'r.id,r.device_id,r.created_at,r.severity,r.message,r.acknowledged,r.acknowledged_at',
            default=>'r.id,r.device_id,r.created_at,r.actuator,r.value,r.duration,r.status,r.simulation,r.completed_at'
        };
        $fields .= ',r.provenance,r.source_session';
        if ($kind==='telemetry') $fields='r.payload,r.received_at,r.provenance,r.source_session';
        $extra = $kind === 'feeding_logs' ? " AND r.actuator='feeder' AND r.status IN ('succeeded','failed','timeout')" : '';
        $statement = $pdo->prepare("SELECT $fields FROM $table r JOIN devices d ON d.id=r.device_id
            WHERE d.user_id=? AND r.device_id=? AND r.created_at>=? AND r.created_at<? $extra
            ORDER BY r.created_at,r.id LIMIT 10001");
        $isCommand = in_array($kind,['commands','feeding_logs'],true);
        $statement->execute([$owner,$device,$isCommand?$start->getTimestamp():$meta['start_at'],
                            $isCommand?$end->getTimestamp():$meta['end_at_exclusive']]);
        $rows = $statement->fetchAll();
        if (count($rows)>10000) throw new InvalidArgumentException('Ekspor melebihi 10.000 baris. Pilih periode lebih pendek.');
        foreach ($rows as &$row) {
            if (array_key_exists('simulation',$row)) $row['simulation'] = (bool)$row['simulation'];
            if ($kind === 'alerts') $row['source'] = Provenance::label($row['provenance']);
            if ($kind === 'telemetry') $row=json_decode($row['payload'],true)+TelemetryRepository::ADDED_FIELDS+['received_at'=>$row['received_at']];
        }
        return ['meta'=>$meta+['source_counts'=>Provenance::counts($rows)],'rows'=>$rows];
    }

    public static function csv(array $export): string
    {
        $stream = fopen('php://temp','r+');
        $rows = $export['rows'];
        $columns = match ($export['meta']['kind']) {
            'readings' => ['id','device_id','created_at','ph','temperature','turbidity','simulation'],
            'alerts' => ['id','device_id','created_at','severity','message','acknowledged','acknowledged_at','source'],
            'reports' => ['day','cnt','ph_avg','temperature_avg','turbidity_avg','simulation_samples','non_simulation_samples'],
            default => ['id','device_id','created_at','actuator','value','duration','status','simulation','completed_at'],
        };
        if ($export['meta']['kind']==='telemetry') $columns=['created_at','received_at','provenance','simulation','source_session','temperature','temperature_status','turbidity_adc','turbidity_mv','turbidity_sensor_mv','turbidity_mapping_percent','soil_ph_adc','soil_ph_mv','tds_adc','tds_mv','tds_ppm_estimate','water_distance_cm','tank_height_cm','water_level_percent','ph_sensor','calibrated'];
        elseif ($export['meta']['kind']!=='reports') $columns=array_merge($columns,['provenance','source_session']);
        foreach(Provenance::SOURCES as $source) $columns[]='source_'.$source;
        fputcsv($stream,$columns,',','"','');
        if ($rows) {
            foreach ($rows as $row) {
                $cells = array_map(static function($value): string {
                    if (is_bool($value)) return $value?'true':'false';
                    $text = (string)($value ?? '');
                    // Spreadsheet applications may execute even quoted formula cells.
                    return is_string($value) && preg_match('/^[\s]*[=+@-]/u',$text) ? "'".$text : $text;
                },array_map(static function($column) use($row,$export) {
                    if (array_key_exists($column,$row)) return $row[$column];
                    if (str_starts_with($column,'source_')) return $export['meta']['source_counts'][substr($column,7)]??0;
                    return null;
                },$columns));
                fputcsv($stream,$cells,',','"','');
            }
        }
        rewind($stream); $csv = stream_get_contents($stream); fclose($stream); return $csv;
    }
}
