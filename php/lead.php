<?php

/**
 * Приём заявки с лендинга: Telegram (+ опционально Google-таблица).
 *
 * Аналог прежнего Cloudflare Worker (worker/lead.js), переписанный под
 * обычный PHP-хостинг (SpaceWeb). Секреты берутся из api/config.php,
 * который генерируется при деплое из GitHub Secrets и не лежит в git.
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

$botToken = $config['TELEGRAM_BOT_TOKEN'] ?? '';
$chatId   = $config['TELEGRAM_CHAT_ID'] ?? '';

if ($botToken === '' || $chatId === '') {
    respond(['ok' => false, 'error' => 'server_not_configured'], 500);
}

$tgOk = sendTelegram($botToken, $chatId, $lead);
if (!$tgOk) {
    respond(['ok' => false, 'error' => 'telegram_failed'], 502);
}

// Best-effort: заявка не падает, если таблица недоступна.
appendToSheet(
    $config['GOOGLE_SHEET_WEBHOOK_URL'] ?? '',
    $config['GOOGLE_SHEET_TOKEN'] ?? '',
    $lead
);

respond(['ok' => true]);

function escapeHtml(string $s): string
{
    return str_replace(['&', '<', '>'], ['&amp;', '&lt;', '&gt;'], $s);
}

function sendTelegram(string $botToken, string $chatId, array $lead): bool
{
    $text = "<b>🚀 Новая заявка на разбор</b>\n\n"
        . '<b>Имя:</b> ' . escapeHtml($lead['name']) . "\n"
        . '<b>Контакт:</b> ' . escapeHtml($lead['contact']) . "\n"
        . ($lead['budget'] !== '' ? '<b>Бюджет:</b> ' . escapeHtml($lead['budget']) . "\n" : '')
        . ($lead['message'] !== '' ? '<b>Задача:</b> ' . escapeHtml($lead['message']) . "\n" : '')
        . "\n<i>" . date('d.m.Y, H:i:s') . '</i>';

    $payload = json_encode([
        'chat_id' => $chatId,
        'text' => $text,
        'parse_mode' => 'HTML',
        'disable_web_page_preview' => true,
    ], JSON_UNESCAPED_UNICODE);

    $response = httpPost(
        "https://api.telegram.org/bot{$botToken}/sendMessage",
        $payload
    );

    return $response !== null && $response['status'] >= 200 && $response['status'] < 300;
}

function appendToSheet(string $webhookUrl, string $token, array $lead): void
{
    if ($webhookUrl === '') {
        return;
    }

    $payload = json_encode([
        'token' => $token,
        'date' => gmdate('c'),
        'name' => $lead['name'],
        'contact' => $lead['contact'],
        'budget' => $lead['budget'],
        'message' => $lead['message'],
    ], JSON_UNESCAPED_UNICODE);

    // Ошибку глотаем — Telegram остаётся основным каналом.
    httpPost($webhookUrl, $payload);
}

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
            CURLOPT_TIMEOUT => 15,
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

    // Фолбэк, если cURL недоступен на хостинге.
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/json\r\n",
            'content' => $jsonBody,
            'timeout' => 15,
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
