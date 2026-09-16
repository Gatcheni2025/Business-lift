<?php
declare(strict_types=1);

const BUSINESS_EXPO_FIREBASE_PROJECT = 'business-lift-3c19c';

function json_response(array $payload, int $status = 200): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES);
    exit;
}

function request_json(): array {
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') return [];
    $data = json_decode($raw, true);
    if (!is_array($data)) json_response(['status' => 'error', 'message' => 'Invalid JSON body.'], 400);
    return $data;
}

function base64url_decode_str(string $value): string {
    $pad = strlen($value) % 4;
    if ($pad) $value .= str_repeat('=', 4 - $pad);
    $decoded = base64_decode(strtr($value, '-_', '+/'), true);
    if ($decoded === false) throw new RuntimeException('Invalid base64url value.');
    return $decoded;
}

function storage_dir(string $subdir = ''): string {
    $root = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage';
    if (!is_dir($root) && !mkdir($root, 0755, true) && !is_dir($root)) {
        throw new RuntimeException('Unable to create storage directory.');
    }
    if ($subdir === '') return $root;
    $path = $root . DIRECTORY_SEPARATOR . trim($subdir, '/\\');
    if (!is_dir($path) && !mkdir($path, 0755, true) && !is_dir($path)) {
        throw new RuntimeException('Unable to create storage directory.');
    }
    return $path;
}

function safe_key(string $value): string {
    return hash('sha256', $value);
}

function read_store(string $subdir, string $key, array $default = []): array {
    $file = storage_dir($subdir) . DIRECTORY_SEPARATOR . safe_key($key) . '.json';
    if (!is_file($file)) return $default;
    $raw = file_get_contents($file);
    if ($raw === false || $raw === '') return $default;
    $data = json_decode($raw, true);
    return is_array($data) ? $data : $default;
}

function write_store(string $subdir, string $key, array $data): void {
    $dir = storage_dir($subdir);
    $file = $dir . DIRECTORY_SEPARATOR . safe_key($key) . '.json';
    $temp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    if ($json === false || file_put_contents($temp, $json, LOCK_EX) === false) {
        throw new RuntimeException('Unable to save data.');
    }
    if (!rename($temp, $file)) {
        @unlink($temp);
        throw new RuntimeException('Unable to finalize data save.');
    }
}

function http_request(string $url, string $method = 'GET', array|string|null $body = null, array $headers = []): array {
    $ch = curl_init($url);
    if ($ch === false) throw new RuntimeException('Unable to initialize HTTP request.');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_CUSTOMREQUEST => $method,
        CURLOPT_HTTPHEADER => $headers,
    ]);
    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, is_array($body) ? http_build_query($body) : $body);
    }
    $response = curl_exec($ch);
    $status = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $error = curl_error($ch);
    curl_close($ch);
    if ($response === false) throw new RuntimeException($error ?: 'Remote request failed.');
    $decoded = json_decode($response, true);
    return ['status' => $status, 'body' => is_array($decoded) ? $decoded : ['raw' => $response]];
}

function authorization_header(): string {
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) return trim((string)$_SERVER['HTTP_AUTHORIZATION']);
    if (function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        foreach ($headers as $name => $value) {
            if (strcasecmp((string)$name, 'Authorization') === 0) return trim((string)$value);
        }
    }
    return '';
}

function firebase_certificates(): array {
    $cacheFile = storage_dir('cache') . DIRECTORY_SEPARATOR . 'firebase-certs.json';
    if (is_file($cacheFile) && filemtime($cacheFile) > time() - 21600) {
        $cached = json_decode((string)file_get_contents($cacheFile), true);
        if (is_array($cached) && $cached) return $cached;
    }
    $result = http_request('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    if ($result['status'] < 200 || $result['status'] >= 300 || !is_array($result['body'])) {
        throw new RuntimeException('Unable to load Firebase signing certificates.');
    }
    file_put_contents($cacheFile, json_encode($result['body'], JSON_UNESCAPED_SLASHES), LOCK_EX);
    return $result['body'];
}

function verify_firebase_token(string $token): array {
    $parts = explode('.', $token);
    if (count($parts) !== 3) throw new RuntimeException('Invalid sign-in token.');
    [$headerPart, $payloadPart, $signaturePart] = $parts;
    $header = json_decode(base64url_decode_str($headerPart), true);
    $payload = json_decode(base64url_decode_str($payloadPart), true);
    if (!is_array($header) || !is_array($payload) || ($header['alg'] ?? '') !== 'RS256') {
        throw new RuntimeException('Invalid sign-in token.');
    }
    $projectId = getenv('FIREBASE_PROJECT_ID') ?: BUSINESS_EXPO_FIREBASE_PROJECT;
    $now = time();
    if (($payload['aud'] ?? '') !== $projectId) throw new RuntimeException('Token audience mismatch.');
    if (($payload['iss'] ?? '') !== "https://securetoken.google.com/{$projectId}") throw new RuntimeException('Token issuer mismatch.');
    if ((int)($payload['exp'] ?? 0) <= $now || (int)($payload['iat'] ?? 0) > $now + 60) throw new RuntimeException('Sign-in token expired.');
    if (empty($payload['sub'])) throw new RuntimeException('Sign-in token has no user id.');
    $kid = (string)($header['kid'] ?? '');
    $certs = firebase_certificates();
    if (!$kid || empty($certs[$kid])) throw new RuntimeException('Unknown Firebase signing key.');
    $signature = base64url_decode_str($signaturePart);
    $verified = openssl_verify($headerPart . '.' . $payloadPart, $signature, $certs[$kid], OPENSSL_ALGO_SHA256);
    if ($verified !== 1) throw new RuntimeException('Invalid sign-in token signature.');
    return $payload;
}

function require_user(): array {
    $header = authorization_header();
    if (!preg_match('/^Bearer\s+(.+)$/i', $header, $match)) {
        json_response(['status' => 'error', 'message' => 'Sign in is required.'], 401);
    }
    try {
        return verify_firebase_token(trim($match[1]));
    } catch (Throwable $error) {
        json_response(['status' => 'error', 'message' => $error->getMessage()], 401);
    }
}

function user_workspace_id(array $user): string {
    return (string)$user['sub'];
}

function clean_text(mixed $value, int $max = 500): string {
    $text = trim((string)$value);
    if (function_exists('mb_substr')) return mb_substr($text, 0, $max);
    return substr($text, 0, $max);
}
