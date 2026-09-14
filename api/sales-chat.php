<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

$user = require_user();
$uid = user_workspace_id($user);
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$thread = read_store('sales-chat', $uid, ['messages'=>[]]);
if (!isset($thread['messages']) || !is_array($thread['messages'])) $thread['messages'] = [];

if ($method === 'GET') {
    json_response(['status'=>'success','messages'=>array_slice($thread['messages'],-20)]);
}

if ($method === 'POST') {
    $input = request_json();
    $message = clean_text($input['message'] ?? '', 1500);
    if ($message === '') json_response(['status'=>'error','message'=>'Type a message before sending.'], 422);
    $entry = [
        'id'=>'msg_'.bin2hex(random_bytes(6)),
        'from'=>'client',
        'message'=>$message,
        'createdAt'=>gmdate('c'),
        'email'=>clean_text($user['email'] ?? '', 250),
        'name'=>clean_text($user['name'] ?? '', 200),
    ];
    $thread['messages'][] = $entry;
    $thread['updatedAt'] = gmdate('c');
    write_store('sales-chat', $uid, $thread);

    $salesEmail = trim((string)(getenv('BUSINESS_EXPO_SALES_EMAIL') ?: ''));
    if ($salesEmail !== '' && filter_var($salesEmail, FILTER_VALIDATE_EMAIL)) {
        $subject = 'Business Expo sales chat request';
        $body = "New dashboard sales-chat message\n\nFrom: ".($entry['name'] ?: 'Business Expo client')."\nEmail: ".$entry['email']."\nWorkspace: {$uid}\n\n{$message}\n";
        @mail($salesEmail, $subject, $body, 'From: no-reply@'.($_SERVER['HTTP_HOST'] ?? 'businessexpo.co.za'));
    }
    json_response(['status'=>'success','message'=>'Message sent to the Business Expo sales team.','entry'=>$entry], 201);
}

json_response(['status'=>'error','message'=>'Method not allowed.'],405);
