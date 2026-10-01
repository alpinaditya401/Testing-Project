<?php
declare(strict_types=1);
require_once dirname(__DIR__) . '/src/ThresholdRules.php';
$hash = ThresholdRules::getHash();
if (!preg_match('/^[a-f0-9]{64}$/D',$hash)) throw new RuntimeException('Invalid rule hash');
echo json_encode(['version'=>ThresholdRules::getVersion(),
    'rule'=>['min'=>ThresholdRules::PH_MIN,'max'=>ThresholdRules::PH_MAX,'source_sha256'=>$hash]],JSON_THROW_ON_ERROR) . PHP_EOL;
