<?php
declare(strict_types=1);

require_once __DIR__ . '/src/Http.php';
require_once __DIR__ . '/src/Database.php';
require_once __DIR__ . '/src/Auth.php';
require_once __DIR__ . '/src/DeviceAuth.php';
require_once __DIR__ . '/src/AuditRepository.php';
require_once __DIR__ . '/src/AlertRepository.php';
require_once __DIR__ . '/src/DeviceRepository.php';
require_once __DIR__ . '/src/DeviceLifecycle.php';
require_once __DIR__ . '/src/ProfileRepository.php';
require_once __DIR__ . '/src/ScheduleRepository.php';
require_once __DIR__ . '/src/SettingsRepository.php';
require_once __DIR__ . '/src/ThresholdRules.php';

Http::securityHeaders();

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if (!str_starts_with($path, '/api/')) {
    $candidate = realpath(__DIR__ . '/../web' . $path);
    $webRoot = realpath(__DIR__ . '/../web');
    if ($path !== '/' && $candidate !== false && $webRoot !== false && str_starts_with($candidate, $webRoot . DIRECTORY_SEPARATOR) && is_file($candidate)) {
        return false;
    }
    readfile(__DIR__ . '/../web/index.html');
    exit;
}

if ($path === '/api/health' && $method === 'GET') {
    Http::json([
        'status' => 'ok',
        'service' => 'aquasmart-api',
    ]);
}

if ($path === '/api/rules' && $method === 'GET') {
    Http::allowCors();
    require_once __DIR__.'/src/ThresholdRules.php';
    $version=ThresholdRules::getVersion();
    $hash=ThresholdRules::getHash();
    Http::json(['version'=>$version,'rule'=>['min'=>ThresholdRules::PH_MIN,'max'=>ThresholdRules::PH_MAX,'source_sha256'=>$hash]],200);exit;
}

set_exception_handler(static function(Throwable $error): void {
    $id=bin2hex(random_bytes(6));
    error_log('[aquasmart '.$id.'] '.get_class($error).' at '.basename($error->getFile()).':'.$error->getLine());
    Http::error('internal_error','Gangguan server. Referensi: '.$id,500);
});
Auth::startSession();
$pdo = Database::connection();
require_once __DIR__.'/src/RateLimiter.php';
require __DIR__.'/product_routes.php';
if($method==='POST' && in_array($path,['/api/auth/login','/api/auth/register'],true))RateLimiter::check($pdo,$path,$path==='/api/auth/login'?30:10);
// Device limits are counted per device after its key is checked (see each route):
// unauthenticated junk must not use up the bucket of real devices sharing a proxy IP.

if ($path === '/api/auth/register' && $method === 'POST') {
    $body = Http::jsonBody();
    $name = trim((string) ($body['name'] ?? ''));
    if ($name === '' || mb_strlen($name) > 100) {
        Http::error('validation_error', 'Isi nama lengkap dulu.', 422);
    }
    $contact = trim((string) ($body['contact'] ?? ''));
    $normalizedPhone = preg_replace('/[\s-]+/', '', $contact) ?? '';
    $isEmail = filter_var($contact, FILTER_VALIDATE_EMAIL) !== false;
    $isWhatsapp = preg_match('/^08\d{8,13}$/', $normalizedPhone) === 1;
    if (!$isEmail && !$isWhatsapp) {
        Http::error('validation_error', 'Format email atau nomor WA belum sesuai.', 422);
    }
    if ($isWhatsapp) {
        $contact = $normalizedPhone;
    }

    $password = (string) ($body['password'] ?? '');
    $passwordConfirmation = (string) ($body['password_confirmation'] ?? '');
    if (strlen($password) < 8 || strlen($password) > 1024) {
        Http::error('validation_error', 'Password minimal 8 karakter.', 422);
    }
    if (!hash_equals($password, $passwordConfirmation)) {
        Http::error('validation_error', 'Password dan konfirmasi belum sama.', 422);
    }
    try {
        $user = Auth::register(
            $pdo,
            $name,
            $contact,
            $password,
            trim((string) ($body['serial_number'] ?? ''))
        );
    } catch (InvalidArgumentException $error) {
        if ($error->getMessage() === 'Serial perangkat sudah digunakan.') {
            Http::error('device_already_claimed', 'Serial perangkat sudah digunakan akun lain.', 409);
        }
        if ($error->getMessage() === 'Serial perangkat tidak tersedia.') {
            Http::error(
                'invalid_device_serial',
                'Serial Number Alat belum terdaftar atau sudah digunakan.',
                422
            );
        }
        throw $error;
    } catch (PDOException $error) {
        if ((string) $error->getCode() === '23000') {
            Http::error('contact_exists', 'Email atau nomor WA sudah terdaftar.', 409);
        }
        throw $error;
    }
    Http::json([
        'user' => $user,
        'csrf_token' => Auth::csrfToken(),
    ], 201);
}

if ($path === '/api/auth/login' && $method === 'POST') {
    $body = Http::jsonBody();
    $username = trim((string) ($body['username'] ?? ''));
    $password = (string) ($body['password'] ?? '');

    if ($username === '' || $password === '') {
        Http::error('validation_error', 'Username dan password wajib diisi.', 422);
    }

    $user = Auth::login($pdo, $username, $password);
    if ($user === null) {
        Http::error('invalid_credentials', 'Kredensial tidak valid.', 401);
    }

    Http::json([
        'user' => $user,
        'csrf_token' => Auth::csrfToken(),
    ]);
}

if ($path === '/api/auth/me' && $method === 'GET') {
    Http::json([
        'user' => Auth::requireUser($pdo),
        'csrf_token' => Auth::csrfToken(),
    ]);
}

if ($path === '/api/auth/logout' && $method === 'POST') {
    $user = Auth::requireUser($pdo);
    Auth::requireCsrf();
    AuditRepository::record($pdo, $user['id'], null, 'auth.logout');
    Auth::logout();
    Http::json(['logged_out' => true]);
}

if ($path === '/api/invitations' && $method === 'POST') {
    $user = Auth::requireAdmin($pdo); Auth::requireCsrf(); $body=Http::jsonBody();
    try { $invitation=WorkspaceRepository::invite($pdo,$user,(string)($body['contact']??'')); }
    catch (InvalidArgumentException $e) { Http::error('validation_error',$e->getMessage(),422); }
    Http::json(['invitation'=>$invitation],201);
}
if ($path === '/api/invitations/accept' && $method === 'POST') {
    $user=Auth::requireUser($pdo); Auth::requireCsrf(); $body=Http::jsonBody();
    try { WorkspaceRepository::accept($pdo,$user,(string)($body['token']??'')); }
    catch (InvalidArgumentException $e) { Http::error('validation_error',$e->getMessage(),422); }
    Http::json(['user'=>Auth::user($pdo)]);
}
if ($path === '/api/growth-observations' && $method === 'GET') {
    $user=Auth::requireUser($pdo);Http::json(['observations'=>ObservationRepository::all($pdo,Auth::workspaceId($user))]);
}
if ($path === '/api/growth-observations' && $method === 'POST') {
    $user=Auth::requireAdmin($pdo);Auth::requireCsrf();
    try {$row=ObservationRepository::create($pdo,$user['id'],Http::jsonBody());}
    catch(InvalidArgumentException $e){Http::error('validation_error',$e->getMessage(),422);}
    if(!$row)Http::error('device_not_found','Perangkat tidak ditemukan.',404);
    Http::json(['observation'=>$row],201);
}
if ($method==='DELETE' && preg_match('#^/api/growth-observations/(\d+)$#',$path,$matches)) {
    $user=Auth::requireAdmin($pdo);Auth::requireCsrf();
    if(!ObservationRepository::delete($pdo,$user['id'],(int)$matches[1]))Http::error('not_found','Observasi tidak ditemukan.',404);
    Http::json(['deleted'=>true]);
}
if ($path === '/api/workspace' && $method === 'GET') {
    $user=Auth::requireUser($pdo);$owner=Auth::workspaceId($user);
    Http::json(['owner_id'=>$owner,'members'=>WorkspaceRepository::members($pdo,$owner)]);
}
if ($method==='DELETE' && preg_match('#^/api/workspace/members/(\d+)$#',$path,$matches)) {
    $user=Auth::requireAdmin($pdo);Auth::requireCsrf();
    if (!WorkspaceRepository::revoke($pdo,$user['id'],(int)$matches[1])) Http::error('not_found','Anggota tidak ditemukan.',404);
    Http::json(['revoked'=>true]);
}

if (preg_match('#^/api/device/devices/([A-Za-z0-9_-]+)/commands(?:/([a-f0-9]{32})/ack)?$#',$path,$matches)) {
    DeviceAuth::requireKey($pdo,$matches[1]);
    RateLimiter::check($pdo,'device_commands:'.$matches[1],240);
    if ($method==='GET' && !isset($matches[2])) Http::json(['commands'=>OperationsRepository::poll($pdo,$matches[1],null,false),'server_time'=>time()]);
    if ($method==='POST' && isset($matches[2])) {
        $body=Http::jsonBody();
        try {$command=OperationsRepository::acknowledge($pdo,$matches[1],$matches[2],(string)($body['status']??''),null,false);}
        catch (InvalidArgumentException $error) {Http::error('validation_error',$error->getMessage(),422);}
        catch (DomainException $error) {Http::error('command_conflict',$error->getMessage(),409);}
        Http::json(['command'=>$command,'physical_actuation_verified'=>false]);
    }
    Http::error('method_not_allowed','Metode tidak didukung.',405);
}
if ($method==='POST' && preg_match('#^/api/devices/([A-Za-z0-9_-]+)/hardware-commands$#',$path,$matches)) {
    $user=Auth::requireAdmin($pdo);Auth::requireCsrf();
    if (getenv('AQUASMART_HARDWARE_ENABLED')!=='1') Http::error('disabled','Antrean hardware belum diaktifkan oleh operator server.',503);
    $body=Http::jsonBody();
    if (!in_array($body['actuator']??null,['feeder','aerator'],true) || !is_bool($body['value']??null)
        || !is_int($body['duration']??null) || !is_string($body['request_id']??null)) Http::error('validation_error','Command hardware tidak valid.',422);
    try {$command=OperationsRepository::enqueue($pdo,$user['id'],$matches[1],$body['actuator'],$body['value'],$body['duration'],$body['request_id'],null,'manual',false);}
    catch (InvalidArgumentException $error) {Http::error('validation_error',$error->getMessage(),422);}
    catch (DomainException $error) {Http::error('command_conflict',$error->getMessage(),409);}
    if ($command===null) Http::error('not_found','Perangkat tidak ditemukan.',404);
    Http::json(['command'=>$command,'physical_actuation_verified'=>false],201);
}

// Explicit simulator-only transport; never exposed as physical device execution.
if (preg_match('#^/api/simulator/devices/([A-Za-z0-9_-]+)/commands(?:/([a-f0-9]{32})/ack)?$#',$path,$matches)) {
    if (getenv('AQUASMART_SIMULATOR_ENABLED')!=='1' || !in_array(getenv('AQUASMART_APP_ENV'),['test','development'],true)) Http::error('disabled','Simulator tidak diaktifkan.',503);
    DeviceAuth::requireKey($pdo, $matches[1]);
    if($method==='GET' && !isset($matches[2]))Http::json(['commands'=>OperationsRepository::poll($pdo,$matches[1])]);
    if($method==='POST' && isset($matches[2])){
        $body=Http::jsonBody();
        try{$command=OperationsRepository::acknowledge($pdo,$matches[1],$matches[2],(string)($body['status']??''));}
        catch(InvalidArgumentException $e){Http::error('validation_error',$e->getMessage(),422);}
        catch(DomainException $e){Http::error('command_conflict',$e->getMessage(),409);}
        Http::json(['command'=>$command]);
    }
    Http::error('method_not_allowed','Metode tidak didukung.',405);
}
if($method==='GET' && preg_match('#^/api/devices/([A-Za-z0-9_-]+)/(commands|feeding-logs)$#',$path,$matches)){
    $user=Auth::requireUser($pdo);
    $rows=$matches[2]==='commands'?OperationsRepository::allForDevice($pdo,Auth::workspaceId($user),$matches[1]):OperationsRepository::feedingLogs($pdo,Auth::workspaceId($user),$matches[1]);
    if($rows===null)Http::error('not_found','Perangkat tidak ditemukan.',404);
    Http::json([$matches[2]==='commands'?'commands':'feeding_logs'=>$rows]);
}

if (preg_match('#^/api/devices/([A-Za-z0-9_-]+)/telemetry$#',$path,$matches)) {
    require_once __DIR__ . '/src/TelemetryRepository.php';
    if ($method==='POST') {
        DeviceAuth::requireKey($pdo,$matches[1]);
        RateLimiter::check($pdo,'device_telemetry:'.$matches[1],240);
        try {$telemetry=TelemetryRepository::ingest($pdo,$matches[1],Http::jsonBody());}
        catch (InvalidArgumentException $error) {Http::error('validation_error',$error->getMessage(),422);}
        catch (DomainException $error) {Http::error('telemetry_conflict',$error->getMessage(),409);}
        Http::json(['telemetry'=>$telemetry,'hardware_verified'=>false],201);
    }
    if ($method==='GET') {
        $user=Auth::requireUser($pdo);
        $rows=TelemetryRepository::recent($pdo,Auth::workspaceId($user),$matches[1]);
        if ($rows===null) Http::error('not_found','Perangkat tidak ditemukan.',404);
        Http::json(['telemetry'=>$rows,'notice'=>'PLACEHOLDER SENSOR TANAH, BUKAN pH AIR TERKALIBRASI; turbidity berupa mapping sementara, bukan NTU.']);
    }
    Http::error('method_not_allowed','Metode tidak didukung.',405);
}

if ($path === '/api/devices' && $method === 'GET') {
    $user = Auth::requireUser($pdo);
    // No scheduler runs in the Railway deployment; settle overdue commands here
    // so the dashboard does not keep showing a timed-out command as applied.
    OperationsRepository::expire($pdo);
    Http::json(['devices' => DeviceRepository::allForUser($pdo, Auth::workspaceId($user))]);
}

if ($path === '/api/devices' && $method === 'POST') {
    $user = Auth::requireAdmin($pdo);
    Auth::requireCsrf();
    $body = Http::jsonBody();
    try {
        $device = DeviceLifecycle::claim($pdo, $user['id'], (string)($body['serial_number'] ?? ''));
    } catch (InvalidArgumentException $error) {
        Http::error('invalid_device_serial', $error->getMessage(), 422);
    } catch (DomainException $error) {
        Http::error('device_already_claimed', $error->getMessage(), 409);
    }
    Http::json(['device'=>$device], 201);
}

if ($method === 'PATCH' && preg_match('#^/api/devices/([A-Za-z0-9_-]+)$#', $path, $matches)) {
    $user = Auth::requireAdmin($pdo);
    Auth::requireCsrf();
    try {
        $updated = DeviceLifecycle::update($pdo, $user['id'], $matches[1], Http::jsonBody());
    } catch (InvalidArgumentException $error) {
        Http::error('validation_error', $error->getMessage(), 422);
    }
    if (!$updated) Http::error('device_not_found', 'Perangkat tidak ditemukan.', 404);
    Http::json(['updated'=>true]);
}

if ($method === 'POST' && preg_match('#^/api/devices/([A-Za-z0-9_-]+)/key$#', $path, $matches)) {
    $user = Auth::requireAdmin($pdo);
    Auth::requireCsrf();
    Http::jsonBody();
    $key = DeviceAuth::rotate($pdo, $user['id'], $matches[1]);
    if ($key === null) Http::error('device_not_found', 'Perangkat tidak ditemukan.', 404);
    Http::json(['device_id'=>$matches[1], 'device_key'=>$key, 'notice'=>'Ditampilkan sekali. Key lama langsung tidak berlaku.']);
}

if ($method === 'POST' && preg_match('#^/api/devices/([A-Za-z0-9_-]+)/heartbeat$#', $path, $matches)) {
    DeviceAuth::requireKey($pdo, $matches[1]);
    RateLimiter::check($pdo, 'device_heartbeat:' . $matches[1], 240);
    Http::jsonBody();
    $heartbeat = DeviceLifecycle::heartbeat($pdo, $matches[1]);
    if (!$heartbeat) Http::error('device_not_found', 'Perangkat tidak ditemukan.', 404);
    Http::json($heartbeat);
}

if ($method === 'POST' && preg_match('#^/api/devices/([A-Za-z0-9_-]+)/readings$#', $path, $matches)) {
    DeviceAuth::requireKey($pdo, $matches[1]);
    RateLimiter::check($pdo, 'device_ingestion:' . $matches[1], 240);
    $body = Http::jsonBody();
    $numericFields = ['ph', 'temperature', 'turbidity'];
    foreach ($numericFields as $field) {
        if (!array_key_exists($field, $body) || !is_numeric($body[$field]) || !is_finite((float) $body[$field])) {
            Http::error('validation_error', 'Nilai sensor harus berupa angka valid.', 422);
        }
    }
    $ph = (float) $body['ph'];
    $temperature = (float) $body['temperature'];
    $turbidity = (float) $body['turbidity'];
    if ($ph < 0 || $ph > 14 || $temperature < -50 || $temperature > 100 || $turbidity < 0) {
        Http::error('validation_error', 'Rentang nilai sensor tidak valid.', 422);
    }
    $simulation = $body['simulation'] ?? false;
    if (!is_bool($simulation)) {
        Http::error('validation_error', 'Field simulation harus boolean.', 422);
    }
    $createdAt = gmdate('Y-m-d\\TH:i:s\\Z');
    if (array_key_exists('created_at', $body)) {
        if (!is_string($body['created_at']) || trim($body['created_at']) === '') {
            Http::error('validation_error', 'created_at harus berupa timestamp ISO-8601.', 422);
        }
        if(!preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/D',$body['created_at']))Http::error('validation_error','created_at harus ISO-8601 dengan zona waktu.',422);
        try {
            $createdAt = (new DateTimeImmutable($body['created_at']))->setTimezone(new DateTimeZone('UTC'))->format('Y-m-d\\TH:i:s\\Z');
            $parseErrors=DateTimeImmutable::getLastErrors();
            if($parseErrors && ($parseErrors['warning_count'] || $parseErrors['error_count']))Http::error('validation_error','Tanggal tidak valid.',422);
            if (!preg_match('/^[0-9]{4}-/',$createdAt) || (int)substr($createdAt,0,4)<1) Http::error('validation_error','Tahun timestamp UTC harus 0001–9999.',422);
        } catch (Exception) {
            Http::error('validation_error', 'created_at harus berupa timestamp ISO-8601.', 422);
        }
        // A reading from the future would stay "latest" and, because alerts only
        // fire for readings newer than the latest, silence alerts for that pond.
        if (strtotime($createdAt) > time() + 300) {
            Http::error('validation_error', 'created_at lebih dari 5 menit di masa depan. Periksa jam perangkat.', 422);
        }
    }
    try {
        $reading = DeviceRepository::ingestReading(
            $pdo, $matches[1], $ph, $temperature, $turbidity, $simulation, $createdAt
        );
    } catch (InvalidArgumentException $error) {
        Http::error('reading_conflict', $error->getMessage(), 409);
    }
    if ($reading === null) {
        Http::error('device_not_found', 'Perangkat tidak ditemukan.', 404);
    }
    Http::json(['reading' => $reading], 201);
}

if ($method === 'GET' && preg_match('#^/api/devices/([A-Za-z0-9_-]+)/readings$#', $path, $matches)) {
    $user = Auth::requireUser($pdo);
    $limit = filter_input(INPUT_GET, 'limit', FILTER_VALIDATE_INT) ?: 18;
    $readings = DeviceRepository::readings($pdo, Auth::workspaceId($user), $matches[1], $limit);
    if ($readings === null) {
        Http::error('device_not_found', 'Perangkat tidak ditemukan.', 404);
    }
    Http::json(['readings' => $readings]);
}

if ($method === 'GET' && preg_match('#^/api/devices/([A-Za-z0-9_-]+)/schedules$#', $path, $matches)) {
    $user = Auth::requireUser($pdo);
    $schedules = ScheduleRepository::allForDevice($pdo, Auth::workspaceId($user), $matches[1]);
    if ($schedules === null) {
        Http::error('device_not_found', 'Perangkat tidak ditemukan.', 404);
    }
    Http::json(['schedules' => $schedules]);
}

if ($method === 'POST' && preg_match('#^/api/devices/([A-Za-z0-9_-]+)/schedules$#', $path, $matches)) {
    $user = Auth::requireAdmin($pdo);
    Auth::requireCsrf();
    $body = Http::jsonBody();
    $time = trim((string) ($body['time'] ?? ''));
    $duration = filter_var($body['duration'] ?? null, FILTER_VALIDATE_INT);
    $days = trim((string) ($body['days'] ?? ''));
    $allowedDays = ['Setiap hari', 'Senin - Jumat', 'Akhir pekan'];
    if (!preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $time)
        || $duration === false || $duration < 1 || $duration > 30
        || !in_array($days, $allowedDays, true)) {
        Http::error('validation_error', 'Data jadwal pakan tidak valid.', 422);
    }
    $schedule = ScheduleRepository::create(
        $pdo,
        $user['id'],
        $matches[1],
        $time,
        $duration,
        $days
    );
    if ($schedule === null) {
        Http::error('device_not_found', 'Perangkat tidak ditemukan.', 404);
    }
    Http::json(['schedule' => $schedule], 201);
}

if ($method === 'DELETE' && preg_match('#^/api/schedules/(\d+)$#', $path, $matches)) {
    $user = Auth::requireAdmin($pdo);
    Auth::requireCsrf();
    if (!ScheduleRepository::delete($pdo, $user['id'], (int) $matches[1])) {
        Http::error('schedule_not_found', 'Jadwal tidak ditemukan.', 404);
    }
    Http::json(['deleted' => true]);
}

if ($method === 'POST' && preg_match('#^/api/devices/([A-Za-z0-9_-]+)/control$#', $path, $matches)) {
    $user = Auth::requireAdmin($pdo);
    Auth::requireCsrf();
    $body = Http::jsonBody();
    $actuator = (string) ($body['actuator'] ?? '');
    if (!in_array($actuator, ['aerator', 'feeder', 'auto'], true) || !array_key_exists('value', $body) || !is_bool($body['value'])) {
        Http::error('validation_error', 'Aktuator atau nilai kontrol tidak valid.', 422);
    }
    $duration=filter_var($body['duration']??8,FILTER_VALIDATE_INT);
    if($duration===false)Http::error('validation_error','Durasi tidak valid.',422);
    try { $device = DeviceRepository::control($pdo, $user['id'], $matches[1], $actuator, $body['value'],isset($body['request_id'])?(string)$body['request_id']:null,$duration); } catch(InvalidArgumentException $e){Http::error('validation_error',$e->getMessage(),422);} catch(DomainException $e){Http::error('command_conflict',$e->getMessage(),409);}
    if ($device === null) {
        Http::error('device_not_found', 'Perangkat tidak ditemukan.', 404);
    }
    $command=$device['command'];unset($device['command']);
    Http::json(['device' => $device, 'command'=>$command]);
}

if ($path === '/api/audit-logs' && $method === 'GET') {
    $user = Auth::requireUser($pdo);
    $limit = filter_input(INPUT_GET, 'limit', FILTER_VALIDATE_INT) ?: 20;
    Http::json(['audit_logs' => AuditRepository::recent($pdo, Auth::workspaceId($user), $limit)]);
}

if ($path === '/api/alerts' && $method === 'GET') {
    $user = Auth::requireUser($pdo);
    $limit = filter_input(INPUT_GET, 'limit', FILTER_VALIDATE_INT) ?: 20;
    Http::json([
        'alerts' => AlertRepository::recent($pdo, Auth::workspaceId($user), $limit),
        'unacknowledged_count' => AlertRepository::unacknowledgedCount($pdo, Auth::workspaceId($user)),
    ]);
}

if ($method === 'PATCH' && preg_match('#^/api/alerts/(\d+)/acknowledge$#', $path, $matches)) {
    $user = Auth::requireAdmin($pdo);
    Auth::requireCsrf();
    $alert = AlertRepository::acknowledge($pdo, $user['id'], (int) $matches[1]);
    if ($alert === null) {
        Http::error('alert_not_found', 'Alert tidak ditemukan.', 404);
    }
    Http::json(['alert' => $alert]);
}

if ($path === '/api/settings/thresholds' && $method === 'GET') {
    $user = Auth::requireUser($pdo);
    Http::json(['thresholds' => SettingsRepository::thresholds($pdo, Auth::workspaceId($user))]);
}

if ($path === '/api/settings/thresholds' && $method === 'PATCH') {
    $user = Auth::requireAdmin($pdo);
    Auth::requireCsrf();
    $body = Http::jsonBody();
    $keys = ['ph_min', 'ph_max', 'temperature_min', 'temperature_max', 'turbidity_max'];
    $values = [];
    foreach ($keys as $key) {
        if (!array_key_exists($key, $body) || !is_numeric($body[$key]) || !is_finite((float) $body[$key])) {
            Http::error('validation_error', 'Semua threshold harus berupa angka.', 422);
        }
        $values[$key] = (float) $body[$key];
    }
    if ($values['ph_min'] < 0 || $values['ph_max'] > 14 || $values['ph_min'] >= $values['ph_max']
        || $values['temperature_min'] >= $values['temperature_max']
        || $values['turbidity_max'] <= 0) {
        Http::error('validation_error', 'Rentang threshold tidak valid.', 422);
    }
    Http::json(['thresholds' => SettingsRepository::updateThresholds($pdo, $user['id'], $values)]);
}

if ($path === '/api/profile' && $method === 'PATCH') {
    $user = Auth::requireUser($pdo);
    Auth::requireCsrf();
    $body = Http::jsonBody();
    $name = trim((string) ($body['name'] ?? ''));
    $phone = trim((string) ($body['phone'] ?? ''));
    if ($name === '' || mb_strlen($name) > 100 || $phone === '' || mb_strlen($phone) > 30) {
        Http::error('validation_error', 'Nama dan nomor telepon tidak valid.', 422);
    }
    Http::json(['user' => ProfileRepository::update($pdo, $user['id'], $name, $phone)]);
}

if ($path === '/api/rule-versions' && $method === 'GET') {
    $user = Auth::requireUser($pdo);
    require_once __DIR__ . '/src/RuleVersionRepository.php';
    Http::json(['versions'=>RuleVersionRepository::all($pdo,Auth::workspaceId($user)),
        'note'=>'Konfigurasi evaluasi sejak pencatatan versi diaktifkan; seed lama tidak direkonstruksi.']);
}

if ($path === '/api/export' && $method === 'GET') {
    $user = Auth::requireUser($pdo);
    $format = $_GET['format'] ?? 'json';
    if (!is_string($format) || !in_array($format,['json','csv'],true)) Http::error('validation_error','Format harus csv atau json.',422);
    require_once __DIR__ . '/src/ExportRepository.php';
    try { $export = ExportRepository::build($pdo,Auth::workspaceId($user),$_GET); }
    catch (InvalidArgumentException $error) { Http::error('validation_error',$error->getMessage(),422); }
    if ($export === null) Http::error('device_not_found','Perangkat tidak ditemukan.',404);
    header('X-Export-Rows: ' . count($export['rows']));
    header('X-Provenance-Counts: ' . json_encode($export['meta']['source_counts']));
    if ($format === 'json') Http::json($export);
    header('Cache-Control: no-store, private');
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="aquasmart-export.csv"');
    echo ExportRepository::csv($export);
    exit;
}

if ($path === '/api/reports' && $method === 'GET') {
    $user = Auth::requireUser($pdo);
    $period = $_GET['period'] ?? 'day';
    $date = $_GET['date'] ?? '';
    $deviceId = $_GET['device_id'] ?? '';
    if (!is_string($period) || !in_array($period, ['day', 'week', 'month'], true)) {
        Http::error('validation_error', 'period harus day, week, atau month.', 422);
    }
    if (!is_string($date) || !preg_match('/^([0-9]{4})-([0-9]{2})-([0-9]{2})$/D', $date, $parts)
        || !checkdate((int) $parts[2], (int) $parts[3], (int) $parts[1])) {
        Http::error('validation_error', 'date harus tanggal kalender valid dengan format YYYY-MM-DD.', 422);
    }
    if (!is_string($deviceId) || !preg_match('/^[A-Za-z0-9_-]{1,128}$/D', $deviceId)) {
        Http::error('validation_error', 'device_id wajib berupa ID perangkat yang valid.', 422);
    }
    require_once __DIR__ . '/src/ReportsRepository.php';
    try {
        $result = ReportsRepository::forDevice($pdo, Auth::workspaceId($user), $deviceId, $period, $date);
    } catch (InvalidArgumentException $error) {
        Http::error('validation_error', $error->getMessage(), 422);
    }
    if ($result === null) {
        Http::error('device_not_found', 'Perangkat tidak ditemukan.', 404);
    }
    Http::json($result);
}

Http::error('not_found', 'Endpoint API tidak ditemukan.', 404);
