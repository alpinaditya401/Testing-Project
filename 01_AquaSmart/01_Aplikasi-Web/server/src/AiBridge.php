<?php
declare(strict_types=1);

/**
 * Jembatan ke Layanan AI Flask (01_AquaSmart/Backend-Flask), SKPL Gambar 12:
 * API PHP mengirim histori pembacaan ke POST /api/predict dan meneruskan
 * rekomendasinya ke web/mobile. Rekomendasi tidak pernah menggerakkan aktuator.
 *
 * AQUASMART_AI_URL dan AQUASMART_AI_KEY adalah konfigurasi operator, bukan input
 * pengguna. Tanpa keduanya endpoint menjawab 503, bukan rekomendasi palsu.
 */
final class AiBridge
{
    private const RECOMMENDATION_ID = '/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/D';

    public static function recommendation(PDO $pdo, int $workspace, string $deviceId): array
    {
        $readings = DeviceRepository::readings($pdo, $workspace, $deviceId, 100);
        if ($readings === null) Http::error('device_not_found', 'Perangkat tidak ditemukan.', 404);
        if (count($readings) < 3) Http::error('not_enough_readings', 'Rekomendasi butuh sedikitnya tiga pembacaan.', 409);
        $payload = [
            'device_id' => $deviceId,
            'readings' => array_map(static fn(array $r): array => [
                'time' => $r['time'], 'ph' => $r['ph'], 'temperature' => $r['temperature'], 'turbidity' => $r['turbidity'],
            ], $readings),
            'thresholds' => SettingsRepository::thresholds($pdo, $workspace),
        ];
        $recommendation = self::call('/api/predict', $payload)['recommendation'] ?? null;
        if (!is_array($recommendation) || !is_string($recommendation['id'] ?? null) || !preg_match(self::RECOMMENDATION_ID, $recommendation['id'])) {
            Http::error('ai_error', 'Layanan AI mengirim jawaban yang tidak dikenali.', 502);
        }
        // Umpan balik hanya boleh untuk rekomendasi yang diberikan ke workspace ini.
        self::migrate($pdo);
        $pdo->prepare('INSERT OR IGNORE INTO ai_recommendations(id,user_id,device_id,created_at) VALUES(?,?,?,?)')
            ->execute([$recommendation['id'], $workspace, $deviceId, gmdate('Y-m-d\TH:i:s\Z')]);
        $simulated = count(array_filter($readings, static fn(array $r): bool => $r['simulation']));
        return ['recommendation' => $recommendation,
                'input' => ['readings' => count($readings), 'simulation_readings' => $simulated]];
    }

    public static function feedback(PDO $pdo, int $workspace, int $userId, string $id, array $body): array
    {
        self::migrate($pdo);
        $q = $pdo->prepare('SELECT device_id FROM ai_recommendations WHERE id=? AND user_id=?');
        $q->execute([$id, $workspace]);
        $deviceId = $q->fetchColumn();
        if ($deviceId === false) Http::error('not_found', 'Rekomendasi tidak ditemukan.', 404);
        $helpful = $body['helpful'] ?? null;
        $note = $body['note'] ?? null;
        if (!is_bool($helpful) || ($note !== null && (!is_string($note) || mb_strlen($note) > 500))) {
            Http::error('validation_error', 'helpful harus boolean; note teks maksimal 500 karakter.', 422);
        }
        $result = self::call('/api/recommendations/' . $id . '/feedback', ['helpful' => $helpful, 'note' => $note]);
        AuditRepository::record($pdo, $userId, (string)$deviceId, 'recommendation.feedback', ['recommendation_id' => $id, 'helpful' => $helpful]);
        return $result;
    }

    public static function isRecommendationId(string $id): bool
    {
        return preg_match(self::RECOMMENDATION_ID, $id) === 1;
    }

    private static function migrate(PDO $pdo): void
    {
        $pdo->exec('CREATE TABLE IF NOT EXISTS ai_recommendations (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), device_id TEXT NOT NULL, created_at TEXT NOT NULL)');
    }

    private static function call(string $path, array $payload): array
    {
        $base = rtrim((string)(getenv('AQUASMART_AI_URL') ?: ''), '/');
        $key = (string)(getenv('AQUASMART_AI_KEY') ?: '');
        if (!preg_match('#^https?://#i', $base) || strlen($key) < 16) {
            Http::error('ai_unavailable', 'Layanan AI belum dikonfigurasi di server.', 503);
        }
        $context = stream_context_create(['http' => [
            'method' => 'POST', 'timeout' => 8, 'ignore_errors' => true, 'follow_location' => 0,
            'header' => "Content-Type: application/json\r\nAccept: application/json\r\nX-AquaSmart-AI-Key: {$key}\r\n",
            'content' => json_encode($payload, JSON_THROW_ON_ERROR),
        ]]);
        $raw = @file_get_contents($base . $path, false, $context);
        $headers = function_exists('http_get_last_response_headers') ? (http_get_last_response_headers() ?? []) : ($http_response_header ?? []);
        if ($raw === false || !$headers || !preg_match('#^HTTP/\S+\s+(\d{3})#', $headers[0], $m)) {
            Http::error('ai_unreachable', 'Layanan AI tidak dapat dihubungi.', 502);
        }
        $status = (int)$m[1];
        $decoded = json_decode($raw, true);
        if ($status === 404 && is_array($decoded) && ($decoded['error']['code'] ?? null) === 'not_found') {
            Http::error('not_found', 'Rekomendasi tidak ditemukan di layanan AI.', 404);
        }
        if ($status !== 200 || !is_array($decoded)) {
            error_log('[aquasmart] AI service HTTP ' . $status . ' for ' . $path);
            Http::error('ai_error', 'Layanan AI sedang bermasalah. Coba lagi nanti.', 502);
        }
        return $decoded;
    }
}
