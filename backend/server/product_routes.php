<?php
declare(strict_types=1);
try {
    if($path==='/api/units'&&$method==='GET') {
        $user=Auth::requireUser($pdo);$owner=Auth::workspaceId($user);
        $q=$pdo->prepare('SELECT d.id FROM devices d JOIN product_units p ON p.serial=d.id WHERE d.user_id=? ORDER BY d.name,d.id');$q->execute([$owner]);
        Http::json(['units'=>array_map(fn($id)=>ProductRepository::onboarding($pdo,$owner,$id),$q->fetchAll(PDO::FETCH_COLUMN)),'seller'=>ProductRepository::seller($pdo,(int)$user['id'])]);
    }
    if($path==='/api/seller/units' && in_array($method,['GET','POST'],true)) {
        $user=Auth::requireUser($pdo);
        if(!ProductRepository::seller($pdo,(int)$user['id']))throw new ProductError('seller_forbidden','Anda bukan operator penjual.',403);
        if($method==='GET')Http::json(['units'=>ProductRepository::inventory($pdo)]);
        Auth::requireCsrf();
        Http::json(['unit'=>ProductRepository::provision($pdo,(int)$user['id'],Http::jsonBody())],201);
    }
    if($path==='/api/units/claim' && $method==='POST') {
        $user=Auth::requireAdmin($pdo);Auth::requireCsrf();$body=Http::jsonBody();
        if(!is_string($body['serial_number']??null)||!is_string($body['activation_code']??null))throw new ProductError('validation_error','Serial dan kode aktivasi harus berupa teks.');
        RateLimiter::check($pdo,'product_claim',ProductPolicy::config()['ACTIVATION_MAX_FAILURES'],ProductPolicy::config()['ACTIVATION_LOCK_SECONDS']);
        Http::json(['unit'=>ProductRepository::claim($pdo,(int)$user['id'],$body['serial_number'],$body['activation_code'])],201);
    }
    if($method==='GET'&&preg_match('#^/api/units/([A-Za-z0-9_-]+)/onboarding$#',$path,$m)) {
        $user=Auth::requireUser($pdo);Http::json(['unit'=>ProductRepository::onboarding($pdo,Auth::workspaceId($user),$m[1])]);
    }
    if($method==='GET'&&preg_match('#^/api/units/([A-Za-z0-9_-]+)/dashboard$#',$path,$m)) {
        $user=Auth::requireUser($pdo);Http::json(['unit'=>ProductRepository::dashboard($pdo,Auth::workspaceId($user),$m[1])]);
    }
    if($method==='POST'&&preg_match('#^/api/units/([A-Za-z0-9_-]+)/commands$#',$path,$m)) {
        $user=Auth::requireAdmin($pdo);Auth::requireCsrf();ProductRepository::onboarding($pdo,(int)$user['id'],$m[1]);$body=Http::jsonBody();
        if(($body['channel']??null)!=='simulation')throw new ProductError('hardware_pending','Kontrol fisik menunggu integrasi perangkat. Tidak ada perintah dikirim.',503);
        if(!in_array($body['actuator']??null,['pump','feeder'],true)||!is_bool($body['value']??null)||!is_string($body['request_id']??null))throw new ProductError('validation_error','Aktuator, nilai atau request_id tidak valid.');
        $duration=$body['actuator']==='feeder'?ProductPolicy::feederDuration($body['duration']??null):0;
        Http::json(['command'=>OperationsRepository::enqueue($pdo,(int)$user['id'],$m[1],$body['actuator'],$body['value'],$duration,$body['request_id'])],201);
    }
} catch(ProductError $e) {Http::error($e->errorCode,$e->getMessage(),$e->status,$e->details);}
catch(InvalidArgumentException $e){Http::error('validation_error',$e->getMessage(),422);}
catch(DomainException $e){Http::error('command_conflict',$e->getMessage(),409);}
