<?php
declare(strict_types=1);
require_once __DIR__ . '/social-lib.php';

$user = require_user();
$workspaceId = user_workspace_id($user);
if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') json_response(['status'=>'error','message'=>'Method not allowed.'], 405);

$profile = read_store('profiles', $workspaceId, []);
$products = read_store('products', $workspaceId, []);
$orders = read_store('orders', $workspaceId, []);
$settings = read_store('settings', $workspaceId, []);
if (!array_is_list($products)) $products = [];
if (!array_is_list($orders)) $orders = [];
if (!is_array($settings)) $settings = [];

usort($orders, fn($a,$b) => strcmp((string)($b['createdAt'] ?? ''), (string)($a['createdAt'] ?? '')));
$customers = [];
$revenue = 0.0;
$pendingOrders = 0;
$lifetimeSales = 0.0;
$availableBalance = 0.0;
$pendingBalance = 0.0;
foreach ($orders as $order) {
    $total = (float)($order['total'] ?? 0);
    $revenue += $total;
    $customer = (string)($order['customerId'] ?? $order['customerEmail'] ?? '');
    if ($customer !== '') $customers[$customer] = true;
    $orderStatus = strtolower((string)($order['orderStatus'] ?? 'new'));
    $paymentStatus = strtolower((string)($order['paymentStatus'] ?? 'pending'));
    if (in_array($orderStatus, ['new','processing'], true)) $pendingOrders++;
    if ($paymentStatus === 'paid') {
        $lifetimeSales += $total;
        if ($orderStatus === 'completed') $availableBalance += $total;
        else $pendingBalance += $total;
    }
}
$lowStock = 0;
foreach ($products as $product) if ((int)($product['stock'] ?? 0) <= 5) $lowStock++;

$social = social_state_for($workspaceId);
$connectedCount = 0;
foreach (['meta','google','whatsapp'] as $provider) if (($social[$provider]['status'] ?? '') === 'connected') $connectedCount++;
$deliveryDone = !empty($settings['delivery']['fulfilmentMode']);
$paymentsDone = !empty($settings['banking']['bankName']) || !empty($settings['payfast']['connected']) || !empty($settings['paymentPreferences']['otherGateway']);
$audienceDone = !empty($settings['audience']['gender']);
$platformDone = $connectedCount > 0;
$setup = [
    'platforms'=>$platformDone,
    'delivery'=>$deliveryDone,
    'payments'=>$paymentsDone,
    'audience'=>$audienceDone,
];
$setup['complete'] = !in_array(false, $setup, true);

json_response([
    'status'=>'success',
    'business'=>[
        'name'=>$profile['businessName'] ?? clean_text($user['name'] ?? $user['email'] ?? 'Your business', 160),
        'profileComplete'=>(bool)($profile['profileComplete'] ?? false),
    ],
    'metrics'=>[
        'revenue'=>$revenue,
        'orders'=>count($orders),
        'customers'=>count($customers),
        'products'=>count($products),
        'pendingOrders'=>$pendingOrders,
        'lowStock'=>$lowStock,
    ],
    'orders'=>[
        'count'=>count($orders),
        'recent'=>array_slice($orders, 0, 5),
    ],
    'balances'=>[
        'availableBalance'=>$availableBalance,
        'pendingBalance'=>$pendingBalance,
        'lifetimeSales'=>$lifetimeSales,
    ],
    'setup'=>$setup,
    'connections'=>['count'=>$connectedCount],
    'shop'=>$settings['shop'] ?? [],
]);
