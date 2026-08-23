<?php
// File: api/publish_channel.php
header('Content-Type: application/json');

$data = json_decode(file_get_contents('php://input'), true);

$productId = $data['product_id'];
$channels = $data['channels']; // Array: ['whatsapp', 'facebook']
$waNumber = $data['whatsapp_number'] ?? null;

// Your Meta Business App Credentials (You get these from developers.facebook.com)
$metaAccessToken = "YOUR_META_SYSTEM_USER_ACCESS_TOKEN";
$catalogId = "YOUR_FACEBOOK_CATALOG_ID";

$responses = [];

// RULE 1: If Facebook or WhatsApp is selected, push to Meta Catalog
if (in_array('facebook', $channels) || in_array('whatsapp', $channels)) {
    
    // The Meta Graph API endpoint for adding products to a catalog
    $url = "https://graph.facebook.com/v18.0/{$catalogId}/products";
    
    // Product data formatted for Meta API
    $postData = [
        'retailer_id' => $productId,
        'name' => $data['product_name'],
        'description' => $data['product_desc'],
        'price' => intval($data['product_price']) * 100, // Meta requires cents
        'currency' => 'ZAR',
        'image_url' => "https://yourwebsite.com/" . $data['product_image'],
        'condition' => 'new'
    ];

    // Execute cURL request to Meta
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_POST, 1);
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($postData));
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer {$metaAccessToken}"
    ]);
    
    $metaResult = curl_exec($ch);
    curl_close($ch);
    
    $responses['meta_catalog'] = json_decode($metaResult);
}

// RULE 2: If WhatsApp is selected and phone number provided, send a WhatsApp Business Message confirmation
if (in_array('whatsapp', $channels) && $waNumber) {
    $waPhoneId = "YOUR_WA_PHONE_NUMBER_ID";
    $waUrl = "https://graph.facebook.com/v18.0/{$waPhoneId}/messages";
    
    $waData = [
        "messaging_product" => "whatsapp",
        "to" => $waNumber,
        "type" => "text",
        "text" => ["body" => "Success! Your product '{$data['product_name']}' is now live on your WhatsApp Catalog."]
    ];

    $ch2 = curl_init($waUrl);
    curl_setopt($ch2, CURLOPT_POST, 1);
    curl_setopt($ch2, CURLOPT_POSTFIELDS, json_encode($waData));
    curl_setopt($ch2, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch2, CURLOPT_HTTPHEADER, [
        "Authorization: Bearer {$metaAccessToken}",
        "Content-Type: application/json"
    ]);
    
    $responses['whatsapp_notify'] = json_decode(curl_exec($ch2));
    curl_close($ch2);
}

echo json_encode(["status" => "success", "api_responses" => $responses]);
?>