<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli')exit(1);
require_once __DIR__.'/src/Database.php';
$id=filter_var($argv[1]??'',FILTER_VALIDATE_INT);
if(!$id||!in_array($argv[2]??'',['grant','revoke'],true))exit("Usage: php server/seller_operator.php USER_ID grant|revoke\n");
$pdo=Database::connection(false);
$q=$pdo->prepare('SELECT id FROM users WHERE id=?');$q->execute([$id]);
if(!$q->fetchColumn())exit("User not found\n");
if($argv[2]==='grant')$pdo->prepare('INSERT OR IGNORE INTO seller_operators(user_id,granted_at) VALUES(?,?)')->execute([$id,time()]);
else $pdo->prepare('DELETE FROM seller_operators WHERE user_id=?')->execute([$id]);
echo "Seller access updated; no device credentials displayed.\n";
