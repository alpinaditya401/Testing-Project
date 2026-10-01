<?php
declare(strict_types=1);
require_once __DIR__.'/../src/Database.php';
require_once __DIR__.'/../src/AuditRepository.php';
$pdo=Database::connection(false);
try {
    $request=json_decode(stream_get_contents(STDIN),true,flags:JSON_THROW_ON_ERROR);
    $result=ProductRepository::claim($pdo,(int)$request['owner'],$request['serial'],$request['code'],$request['now']??null);
    echo json_encode(['ok'=>true,'unit'=>$result]);
}catch(ProductError $e){echo json_encode(['ok'=>false,'error'=>$e->errorCode,'details'=>$e->details]);}
