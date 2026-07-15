/**
 * Обработка заявки: отправка в Telegram (+ опционально в Google-таблицу).
 *
 * Секреты (Cloudflare → проект → Settings → Variables and Secrets):
 *   TELEGRAM_BOT_TOKEN       — токен бота от @BotFather        (обязательно)
 *   TELEGRAM_CHAT_ID         — ваш chat id (через @userinfobot)(обязательно)
 *   GOOGLE_SHEET_WEBHOOK_URL — URL веб-приложения Apps Script  (необязательно)
 *   GOOGLE_SHEET_TOKEN       — общий секрет для Apps Script     (необязательно)
 */

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const escapeHtml = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

async function sendTelegram(env, { name, contact, budget, message }) {
  const text =
    `<b>🚀 Новая заявка на разбор</b>\n\n` +
    `<b>Имя:</b> ${escapeHtml(name)}\n` +
    `<b>Контакт:</b> ${escapeHtml(contact)}\n` +
    (budget ? `<b>Бюджет:</b> ${escapeHtml(budget)}\n` : "") +
    (message ? `<b>Задача:</b> ${escapeHtml(message)}\n` : "") +
    `\n<i>${new Date().toLocaleString("ru-RU")}</i>`;

  const res = await fetch(
    `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    },
  );
  return res.ok;
}

// Best-effort: не роняет заявку, если таблица недоступна.
async function appendToSheet(env, { name, contact, budget, message }) {
  if (!env.GOOGLE_SHEET_WEBHOOK_URL) return;
  try {
    await fetch(env.GOOGLE_SHEET_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token: env.GOOGLE_SHEET_TOKEN || "",
        date: new Date().toISOString(),
        name,
        contact,
        budget,
        message,
      }),
    });
  } catch {
    // игнорируем — Telegram остаётся основным каналом
  }
}

export async function handleLead(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  // honeypot: боты заполняют скрытое поле company
  if (body.company) {
    return json({ ok: true });
  }

  const lead = {
    name: String(body.name || "").trim().slice(0, 200),
    contact: String(body.contact || "").trim().slice(0, 200),
    budget: String(body.budget || "").trim().slice(0, 30),
    message: String(body.message || "").trim().slice(0, 2000),
  };

  if (!lead.name || !lead.contact) {
    return json({ ok: false, error: "missing_fields" }, 422);
  }

  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return json({ ok: false, error: "server_not_configured" }, 500);
  }

  const tgOk = await sendTelegram(env, lead);
  if (!tgOk) {
    return json({ ok: false, error: "telegram_failed" }, 502);
  }

  await appendToSheet(env, lead);

  return json({ ok: true });
}
