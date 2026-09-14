<?php
declare(strict_types=1);
require_once __DIR__ . '/bootstrap.php';

function business_expo_secret_key(): string {
    $configured = trim((string)(getenv('BUSINESS_EXPO_DATA_KEY') ?: ''));
    if ($configured === '') {
        throw new RuntimeException('BUSINESS_EXPO_DATA_KEY is not configured on the PHP server.');
    }
    if (preg_match('/^[a-f0-9]{64}$/i', $configured)) {
        $decoded = hex2bin($configured);
        if ($decoded !== false) return $decoded;
    }
    return hash('sha256', $configured, true);
}

function encrypt_secret(string $plaintext): string {
    if ($plaintext === '') return '';
    $key = business_expo_secret_key();
    $iv = random_bytes(12);
    $tag = '';
    $ciphertext = openssl_encrypt($plaintext, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag, '', 16);
    if ($ciphertext === false) throw new RuntimeException('Unable to encrypt sensitive data.');
    return 'enc:v1:' . base64_encode($iv . $tag . $ciphertext);
}

function decrypt_secret(string $encoded): string {
    if ($encoded === '') return '';
    if (!str_starts_with($encoded, 'enc:v1:')) return $encoded;
    $raw = base64_decode(substr($encoded, 7), true);
    if ($raw === false || strlen($raw) < 29) throw new RuntimeException('Stored sensitive data is invalid.');
    $iv = substr($raw, 0, 12);
    $tag = substr($raw, 12, 16);
    $ciphertext = substr($raw, 28);
    $plaintext = openssl_decrypt($ciphertext, 'aes-256-gcm', business_expo_secret_key(), OPENSSL_RAW_DATA, $iv, $tag);
    if ($plaintext === false) throw new RuntimeException('Unable to decrypt sensitive data.');
    return $plaintext;
}
