<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

$user = require_user();
$workspaceId = user_workspace_id($user);
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if ($method !== 'GET') json_response(['status'=>'error','message'=>'Method not allowed.'], 405);

$orders = read_store('orders', $workspaceId, []);
if (!array_is_list($orders)) $orders = [];
$customers = [];
foreach ($orders as $order) {
    $id = clean_text($order['customerId'] ?? $order['customerEmail'] ?? '', 240);
    if ($id === '') continue;
    if (!isset($customers[$id])) {
        $customers[$id] = [
            'id'=>$id,
            'name'=>clean_text($order['customerName'] ?? '', 200),
            'email'=>clean_text($order['customerEmail'] ?? '', 240),
            'orders'=>0,
            'total'=>0.0,
            'lastOrderAt'=>'',
        ];
    }
    $customers[$id]['orders']++;
    $customers[$id]['total'] += (float)($order['total'] ?? 0);
    $createdAt = (string)($order['createdAt'] ?? '');
    if ($createdAt > $customers[$id]['lastOrderAt']) $customers[$id]['lastOrderAt'] = $createdAt;
}
$list = array_values($customers);
usort($list, fn($a,$b) => strcmp((string)$b['lastOrderAt'], (string)$a['lastOrderAt']));
json_response(['status'=>'success','customers'=>$list]);
