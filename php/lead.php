<?php

/**
 * Приём заявки с лендинга на SpaceWeb.
 *
 * SpaceWeb часто блокирует исходящие запросы к api.telegram.org,
 * поэтому PHP шлёт заявку в Google Apps Script — он пишет в таблицу
 * и отправляет уведомление в Telegram со своих серверов.
 */

header('Content-Type: application/json; charset=utf-8');

function respond(array $data, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond(['ok' => false, 'error' => 'method_not_allowed'], 405);
}

$config = @include __DIR__ . '/config.php';
if (!is_array($config)) {
    $config = [];
}

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) {
    respond(['ok' => false, 'error' => 'invalid_json'], 400);
}

// honeypot: боты заполняют скрытое поле company
if (!empty($body['company'])) {
    respond(['ok' => true]);
}

$clip = static function ($value, int $max): string {
    return mb_substr(trim((string) ($value ?? '')), 0, $max);
};

$lead = [
    'name'    => $clip($body['name'] ?? '', 200),
    'contact' => $clip($body['contact'] ?? '', 200),
    'budget'  => $clip($body['budget'] ?? '', 30),
    'message' => $clip($body['message'] ?? '', 2000),
];

if ($lead['name'] === '' || $lead['contact'] === '') {
    respond(['ok' => false, 'error' => 'missing_fields'], 422);
}

$webhookUrl = $config['GOOGLE_SHEET_WEBHOOK_URL'] ?? '';
$token = $config['GOOGLE_SHEET_TOKEN'] ?? '';

if ($webhookUrl === '') {
    respond(['ok' => false, 'error' => 'server_not_configured'], 500);
}

$payload = json_encode([
    'token' => $token,
    'date' => gmdate('c'),
    'name' => $lead['name'],
    'contact' => $lead['contact'],
    'budget' => $lead['budget'],
    'message' => $lead['message'],
], JSON_UNESCAPED_UNICODE);

$response = httpPost($webhookUrl, $payload);
if ($response === null) {
    respond(['ok' => false, 'error' => 'webhook_unreachable'], 502);
}

$decoded = json_decode($response['body'], true);
if ($response['status'] < 200 || $response['status'] >= 300 || !is_array($decoded) || empty($decoded['ok'])) {
    respond(['ok' => false, 'error' => 'webhook_failed'], 502);
}

respond(['ok' => true]);

/**
 * @return array{status:int, body:string}|null
 */
function httpPost(string $url, string $jsonBody): ?array
{
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $jsonBody,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 20,
        ]);
        $body = curl_exec($ch);
        if ($body === false) {
            curl_close($ch);
            return null;
        }
        $status = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return ['status' => $status, 'body' => (string) $body];
    }

    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => $jsonBody,
            'timeout' => 20,
            'ignore_errors' => true,
        ],
    ]);
    $body = @file_get_contents($url, false, $context);
    if ($body === false) {
        return null;
    }
    $status = 200;
    if (isset($http_response_header[0]) && preg_match('/\s(\d{3})\s/', $http_response_header[0], $m)) {
        $status = (int) $m[1];
    }
    return ['status' => $status, 'body' => (string) $body];
}
