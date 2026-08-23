<?php
// File: api/upload_product.php
header('Content-Type: application/json');

// 1. Create uploads directory if it doesn't exist
$targetDir = "../uploads/";
if (!file_exists($targetDir)) {
    mkdir($targetDir, 0777, true);
}

// 2. Capture basic product info
$productName = $_POST['name'] ?? 'Unnamed Product';
$productPrice = $_POST['price'] ?? 0;
$productDesc = $_POST['desc'] ?? '';
$imageUrls = [];

// 3. Process the uploaded images
if (!empty($_FILES['images'])) {
    foreach ($_FILES['images']['tmp_name'] as $key => $tmp_name) {
        if ($_FILES['images']['error'][$key] === UPLOAD_ERR_OK) {
            $fileName = time() . '_' . basename($_FILES['images']['name'][$key]);
            $targetFilePath = $targetDir . $fileName;
            
            // Move file from temp to physical server folder
            if (move_uploaded_file($tmp_name, $targetFilePath)) {
                $imageUrls[] = "uploads/" . $fileName; // Path to save in database
            }
        }
    }
}

// 4. Connect to your database here (MySQL). 
// For this example, we return success with the real saved paths.
$response = [
    "status" => "success",
    "product" => [
        "id" => uniqid("prod_"),
        "name" => $productName,
        "price" => $productPrice,
        "desc" => $productDesc,
        "images" => $imageUrls
    ]
];

echo json_encode($response);
?>