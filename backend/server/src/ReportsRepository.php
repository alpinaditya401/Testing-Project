<?php
declare(strict_types=1);

final class ReportsRepository
{
    /** Daily UTC buckets within the selected calendar period; null hides inaccessible devices. */
    public static function forDevice(
        PDO $pdo, int $ownerId, string $deviceId, string $period, string $date
    ): ?array {
        $start = new DateTimeImmutable($date, new DateTimeZone('UTC'));
        if ($period === 'week') {
            $start = $start->modify('-' . ((int) $start->format('N') - 1) . ' days');
            $end = $start->modify('+7 days');
        } elseif ($period === 'month') {
            $start = $start->modify('first day of this month');
            $end = $start->modify('+1 month');
        } else {
            $end = $start->modify('+1 day');
        }
        if ((int) $end->format('Y') > 9999) {
            throw new InvalidArgumentException('Periode melampaui rentang tanggal yang didukung.');
        }
        $ownership = $pdo->prepare('SELECT 1 FROM devices WHERE id = ? AND user_id = ?');
        $ownership->execute([$deviceId, $ownerId]);
        if (!$ownership->fetchColumn()) return null;

        // Ingestion normalizes created_at to UTC ISO-8601. Keep the indexed range
        // predicate and an ownership join; never aggregate another workspace.
        $query = $pdo->prepare(
            "SELECT substr(r.created_at, 1, 10) AS day,
                    AVG(r.ph) AS ph_avg, AVG(r.temperature) AS temperature_avg,
                    AVG(r.turbidity) AS turbidity_avg, COUNT(*) AS cnt,
                    SUM(r.simulation) AS simulation_samples,
                    SUM(r.provenance='simulation') AS source_simulation,
                    SUM(r.provenance='device') AS source_device,
                    SUM(r.provenance='manual') AS source_manual,
                    SUM(r.provenance='seed') AS source_seed,
                    SUM(r.provenance='legacy_unverified') AS source_legacy_unverified
             FROM sensor_readings r JOIN devices d ON d.id = r.device_id
             WHERE r.device_id = :device_id AND d.user_id = :owner_id
               AND r.created_at >= :start_at AND r.created_at < :end_at
             GROUP BY day ORDER BY day ASC"
        );
        $format = 'Y-m-d\TH:i:s\Z';
        $query->execute([
            ':device_id' => $deviceId, ':owner_id' => $ownerId,
            ':start_at' => $start->format($format), ':end_at' => $end->format($format),
        ]);
        $groups = [];
        $total = 0;
        $simulated = 0; $sourceCounts=array_fill_keys(Provenance::SOURCES,0);
        while ($row = $query->fetch(PDO::FETCH_ASSOC)) {
            // SQLite AVG can overflow even when each stored sample is finite.
            // Fail explicitly through the router's JSON error handler; never
            // fabricate a value or emit an empty successful response.
            foreach (['ph_avg', 'temperature_avg', 'turbidity_avg'] as $metric) {
                if ($row[$metric] === null || !is_finite((float) $row[$metric])) {
                    throw new RuntimeException('Report aggregate is non-finite.');
                }
            }
            $count = (int) $row['cnt'];
            $simulationCount = (int) $row['simulation_samples'];
            $sourceGroup=[]; foreach(Provenance::SOURCES as $source) { $sourceGroup['source_'.$source]=(int)$row['source_'.$source]; $sourceCounts[$source]+=(int)$row['source_'.$source]; }
            $groups[] = [
                'day' => $row['day'], 'cnt' => $count,
                'ph_avg' => (float) $row['ph_avg'],
                'temperature_avg' => (float) $row['temperature_avg'],
                'turbidity_avg' => (float) $row['turbidity_avg'],
                'simulation_samples' => $simulationCount,
                'non_simulation_samples' => $count - $simulationCount,
            ] + $sourceGroup;
            $total += $count;
            $simulated += $simulationCount;
        }
        return [
            'device_id' => $deviceId, 'period' => $period, 'date' => $date,
            'timezone' => 'UTC', 'start_at' => $start->format($format),
            'end_at_exclusive' => $end->format($format),
            'groups' => $groups, 'total_samples' => $total, 'source_counts'=>$sourceCounts,
            'simulation_samples' => $simulated, 'non_simulation_samples' => $total - $simulated,
        ];
    }
}
