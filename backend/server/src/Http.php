<?php
declare(strict_types=1);

final class Http
{
    public static function securityHeaders(): void
    {
        header('X-Content-Type-Options: nosniff');
        header('X-Frame-Options: DENY');
        header('Referrer-Policy: strict-origin-when-cross-origin');
        header("Permissions-Policy: camera=(), microphone=(), geolocation=()");
        header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    }
    
    public static function allowCors(): void
    {
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-CSRF-Token, X-Device-Key');
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }

    public static function json(array $payload, int $status = 200): never
    {
        http_response_code($status);
        header('Cache-Control: no-store, private');
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        exit;
    }

    public static function error(string $code, string $message, int $status, array $details = []): never
    {
        $error = ['code' => $code, 'message' => $message];
        if ($details !== []) {
            $error['details'] = $details;
        }
        self::json(['error' => $error], $status);
    }

    public static function jsonBody(): array
    {
        $contentType = strtolower(trim(explode(';', $_SERVER['CONTENT_TYPE'] ?? '')[0]));
        if ($contentType !== 'application/json') {
            self::error('unsupported_media_type', 'Gunakan Content-Type application/json.', 415);
        }

        $raw = file_get_contents('php://input', false, null, 0, 65537);
        if(strlen($raw ?: '')>65536)self::error('payload_too_large','Payload maksimal 64 KiB.',413);
        try {
            $decoded = json_decode($raw ?: '{}', true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            self::error('invalid_json', 'Payload JSON tidak valid.', 400);
        }

        if (!is_array($decoded) || !str_starts_with(ltrim($raw ?: ''), '{')) {
            self::error('invalid_json', 'Payload JSON harus berupa objek.', 400);
        }
        foreach($decoded as $value)if(is_array($value)||is_object($value))self::error('validation_error','Field harus nilai tunggal, bukan objek atau array.',422);
        return $decoded;
    }
}
