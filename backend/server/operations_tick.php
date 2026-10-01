<?php
declare(strict_types=1);
// Explicit one-shot local scheduler. Never falls back to the active project DB.
$path=getenv('AQUASMART_DB_PATH');
$active=realpath(__DIR__.'/data/aquasmart.sqlite');
if(PHP_SAPI!=='cli'||!$path||!is_file($path)||realpath($path)===$active||!in_array(getenv('AQUASMART_APP_ENV'),['test','development'],true)||getenv('AQUASMART_SIMULATOR_ENABLED')!=='1'){
    fwrite(STDERR,"Refused: explicit existing temporary DB and simulator test/development environment required.\n");exit(2);
}
require_once __DIR__.'/src/Database.php';
require_once __DIR__.'/src/OperationsRepository.php';
$pdo=Database::connection();
$result=OperationsRepository::tick($pdo,new DateTimeImmutable('now',new DateTimeZone('UTC')));
fwrite(STDOUT,json_encode(['simulation'=>true,'commands'=>$result,'physical_hardware'=>false],JSON_THROW_ON_ERROR)."\n");
