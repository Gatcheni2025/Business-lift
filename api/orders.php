<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

$user = require_user();
$workspaceId = user_workspace_id($user);
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$orders = read_store('orders', $workspaceId, []);
if (!array_is_list($orders)) $orders = [];

function order_sort(array &$orders): void {
    usort($orders, fn($a,$b) => strcmp((string)($b['createdAt'] ?? ''), (string)($a['createdAt'] ?? '')));
}

if ($method === 'GET') {
    order_sort($orders);
    json_response(['status'=>'success','orders'=>$orders]);
}

if ($method === 'POST') {
    $input = request_json();
    $productId = clean_text($input['productId'] ?? '', 100);
    $customerId = clean_text($input['customerId'] ?? '', 240);
    $customerName = clean_text($input['customerName'] ?? '', 200);
    $customerEmail = clean_text($input['customerEmail'] ?? '', 240);
    $quantity = filter_var($input['quantity'] ?? null, FILTER_VALIDATE_INT);
    $shipping = filter_var($input['shipping'] ?? 0, FILTER_VALIDATE_FLOAT);
    $tax = filter_var($input['tax'] ?? 0, FILTER_VALIDATE_FLOAT);
    $paymentStatus = in_array(($input['paymentStatus'] ?? 'pending'), ['pending','paid','failed','refunded'], true) ? $input['paymentStatus'] : 'pending';
    $orderStatus = in_array(($input['orderStatus'] ?? 'new'), ['new','processing','shipping','completed','cancelled'], true) ? $input['orderStatus'] : 'new';

    if ($productId === '' || $customerId === '') json_response(['status'=>'error','message'=>'Select a product and enter a customer ID.'], 422);
    if ($quantity === false || $quantity < 1) json_response(['status'=>'error','message'=>'Quantity must be a whole number greater than zero.'], 422);
    if ($shipping === false || $shipping < 0 || $tax === false || $tax < 0) json_response(['status'=>'error','message'=>'Shipping and tax must be valid positive values.'], 422);

    $products = read_store('products', $workspaceId, []);
    if (!array_is_list($products)) $products = [];
    $productIndex = null;
    $product = null;
    foreach ($products as $index => $candidate) {
        if (($candidate['id'] ?? '') === $productId) { $productIndex = $index; $product = $candidate; break; }
    }
    if (!$product) json_response(['status'=>'error','message'=>'The selected product no longer exists.'], 404);
    $stock = (int)($product['stock'] ?? 0);
    if ($stock < $quantity) json_response(['status'=>'error','message'=>'Not enough stock is available for this order.'], 422);

    $unitPrice = (float)($product['price'] ?? 0);
    $subtotal = $unitPrice * $quantity;
    $total = $subtotal + (float)$shipping + (float)$tax;
    $now = gmdate('c');
    $order = [
        'id' => 'ord_' . bin2hex(random_bytes(8)),
        'businessId' => $workspaceId,
        'orderNumber' => '#BE-' . strtoupper(substr(bin2hex(random_bytes(4)), 0, 8)),
        'customerId' => $customerId,
        'customerName' => $customerName,
        'customerEmail' => $customerEmail,
        'items' => [[
            'productId' => $productId,
            'name' => clean_text($product['name'] ?? 'Product', 200),
            'quantity' => (int)$quantity,
            'price' => $unitPrice,
        ]],
        'subtotal' => round($subtotal, 2),
        'shipping' => round((float)$shipping, 2),
        'tax' => round((float)$tax, 2),
        'total' => round($total, 2),
        'paymentStatus' => $paymentStatus,
        'orderStatus' => $orderStatus,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];

    $orders[] = $order;
    $products[$productIndex]['stock'] = max(0, $stock - (int)$quantity);
    $products[$productIndex]['updatedAt'] = $now;
    write_store('orders', $workspaceId, $orders);
    write_store('products', $workspaceId, $products);
    json_response(['status'=>'success','order'=>$order], 201);
}

if ($method === 'PATCH' || $method === 'PUT') {
    $input = request_json();
    $id = clean_text($input['id'] ?? '', 100);
    if ($id === '') json_response(['status'=>'error','message'=>'Order id is required.'], 422);
    $updated = null;
    foreach ($orders as &$order) {
        if (($order['id'] ?? '') !== $id) continue;
        if (isset($input['orderStatus']) && in_array($input['orderStatus'], ['new','processing','shipping','completed','cancelled'], true)) $order['orderStatus'] = $input['orderStatus'];
        if (isset($input['paymentStatus']) && in_array($input['paymentStatus'], ['pending','paid','failed','refunded'], true)) $order['paymentStatus'] = $input['paymentStatus'];
        $order['updatedAt'] = gmdate('c');
        $updated = $order;
        break;
    }
    unset($order);
    if (!$updated) json_response(['status'=>'error','message'=>'Order not found.'], 404);
    write_store('orders', $workspaceId, $orders);
    json_response(['status'=>'success','order'=>$updated]);
}

json_response(['status'=>'error','message'=>'Method not allowed.'], 405);
