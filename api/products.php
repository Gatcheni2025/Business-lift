<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

$user = require_user();
$workspaceId = user_workspace_id($user);
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

function product_file_name(string $original, string $mime): string {
    $ext = match ($mime) {
        'image/webp' => 'webp',
        'image/png' => 'png',
        default => 'jpg',
    };
    $base = preg_replace('/[^a-z0-9_-]+/i', '-', pathinfo($original, PATHINFO_FILENAME)) ?: 'product';
    return strtolower(trim($base, '-')) . '-' . bin2hex(random_bytes(6)) . '.' . $ext;
}

function compress_product_image(array $file): string {
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        throw new RuntimeException('One of the product images could not be uploaded.');
    }
    if (($file['size'] ?? 0) > 8 * 1024 * 1024) throw new RuntimeException('Each image must be smaller than 8MB.');
    $tmp = (string)$file['tmp_name'];
    $info = @getimagesize($tmp);
    if (!$info || empty($info['mime']) || !in_array($info['mime'], ['image/jpeg','image/png','image/webp'], true)) {
        throw new RuntimeException('Only JPG, PNG and WebP product images are allowed.');
    }
    $mime = $info['mime'];
    $uploadDir = dirname(__DIR__) . '/uploads/products';
    if (!is_dir($uploadDir) && !mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
        throw new RuntimeException('Unable to create the product image folder.');
    }

    if (!function_exists('imagecreatetruecolor')) {
        $name = product_file_name((string)$file['name'], $mime);
        if (!move_uploaded_file($tmp, $uploadDir . '/' . $name)) throw new RuntimeException('Unable to save product image.');
        return '/uploads/products/' . $name;
    }

    $source = match ($mime) {
        'image/png' => @imagecreatefrompng($tmp),
        'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($tmp) : false,
        default => @imagecreatefromjpeg($tmp),
    };
    if (!$source) throw new RuntimeException('Unable to process product image.');

    $width = imagesx($source); $height = imagesy($source);
    $max = 1600;
    $scale = min(1, $max / max($width, $height));
    $newWidth = max(1, (int)round($width * $scale));
    $newHeight = max(1, (int)round($height * $scale));
    $canvas = imagecreatetruecolor($newWidth, $newHeight);
    imagealphablending($canvas, false); imagesavealpha($canvas, true);
    $transparent = imagecolorallocatealpha($canvas, 255,255,255,127);
    imagefilledrectangle($canvas, 0,0,$newWidth,$newHeight,$transparent);
    imagecopyresampled($canvas, $source, 0,0,0,0,$newWidth,$newHeight,$width,$height);

    $outputMime = function_exists('imagewebp') ? 'image/webp' : ($mime === 'image/png' ? 'image/png' : 'image/jpeg');
    $name = product_file_name((string)$file['name'], $outputMime);
    $target = $uploadDir . '/' . $name;
    $saved = $outputMime === 'image/webp' ? imagewebp($canvas, $target, 78)
        : ($outputMime === 'image/png' ? imagepng($canvas, $target, 8) : imagejpeg($canvas, $target, 80));
    imagedestroy($source); imagedestroy($canvas);
    if (!$saved) throw new RuntimeException('Unable to save compressed product image.');
    return '/uploads/products/' . $name;
}

function normalized_files(string $key): array {
    if (empty($_FILES[$key])) return [];
    $files = $_FILES[$key];
    if (!is_array($files['name'])) return [$files];
    $out = [];
    foreach ($files['name'] as $i => $name) {
        $out[] = ['name'=>$name,'type'=>$files['type'][$i] ?? '','tmp_name'=>$files['tmp_name'][$i] ?? '', 'error'=>$files['error'][$i] ?? UPLOAD_ERR_NO_FILE,'size'=>$files['size'][$i] ?? 0];
    }
    return $out;
}

$products = read_store('products', $workspaceId, []);
if (!array_is_list($products)) $products = [];

if ($method === 'GET') {
    usort($products, fn($a,$b) => strcmp((string)($b['createdAt'] ?? ''), (string)($a['createdAt'] ?? '')));
    json_response(['status'=>'success','products'=>$products]);
}

if ($method === 'POST') {
    $name = clean_text($_POST['name'] ?? '', 160);
    $description = clean_text($_POST['description'] ?? $_POST['desc'] ?? '', 3000);
    $category = clean_text($_POST['category'] ?? '', 120);
    $sku = strtoupper(clean_text($_POST['sku'] ?? '', 80));
    if ($name === '' || $description === '' || $category === '' || $sku === '') {
        json_response(['status'=>'error','message'=>'Complete all required product fields before saving.'], 422);
    }
    $price = filter_var($_POST['price'] ?? null, FILTER_VALIDATE_FLOAT);
    $costPrice = filter_var($_POST['costPrice'] ?? 0, FILTER_VALIDATE_FLOAT);
    $stock = filter_var($_POST['stock'] ?? 0, FILTER_VALIDATE_INT);
    if ($price === false || $price < 0 || $costPrice === false || $costPrice < 0 || $stock === false || $stock < 0) {
        json_response(['status'=>'error','message'=>'Price, cost price and stock must be valid positive values.'], 422);
    }
    $channels = json_decode((string)($_POST['channelPublish'] ?? '{}'), true);
    if (!is_array($channels)) $channels = [];
    $images = [];
    try {
        foreach (array_slice(normalized_files('images'), 0, 5) as $file) $images[] = compress_product_image($file);
    } catch (Throwable $error) {
        json_response(['status'=>'error','message'=>$error->getMessage()], 422);
    }
    $now = gmdate('c');
    $product = [
        'id' => 'prod_' . bin2hex(random_bytes(8)),
        'businessId' => $workspaceId,
        'name' => $name,
        'description' => $description,
        'price' => (float)$price,
        'costPrice' => (float)$costPrice,
        'sku' => $sku,
        'stock' => (int)$stock,
        'category' => $category,
        'images' => $images,
        'imageUrl' => $images[0] ?? clean_text($_POST['imageUrl'] ?? '', 1000),
        'status' => in_array($_POST['status'] ?? 'active', ['active','draft'], true) ? $_POST['status'] : 'active',
        'channelPublish' => $channels,
        'createdAt' => $now,
        'updatedAt' => $now,
    ];
    $products[] = $product;
    write_store('products', $workspaceId, $products);
    json_response(['status'=>'success','product'=>$product], 201);
}

if ($method === 'PATCH' || $method === 'PUT') {
    $input = request_json();
    $id = clean_text($input['id'] ?? '', 80);
    $found = false;
    foreach ($products as &$product) {
        if (($product['id'] ?? '') !== $id) continue;
        $found = true;
        if (isset($input['channelPublish']) && is_array($input['channelPublish'])) $product['channelPublish'] = $input['channelPublish'];
        if (isset($input['status']) && in_array($input['status'], ['active','draft'], true)) $product['status'] = $input['status'];
        $product['updatedAt'] = gmdate('c');
        $updated = $product;
        break;
    }
    unset($product);
    if (!$found) json_response(['status'=>'error','message'=>'Product not found.'], 404);
    write_store('products', $workspaceId, $products);
    json_response(['status'=>'success','product'=>$updated]);
}

json_response(['status'=>'error','message'=>'Method not allowed.'], 405);
