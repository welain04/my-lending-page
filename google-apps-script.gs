/**
 * Google Apps Script — приёмник заявок в Google-таблицу.
 *
 * Как подключить:
 * 1. Создайте Google-таблицу.
 * 2. В ней: Расширения → Apps Script.
 * 3. Вставьте этот код, замените TOKEN на свой секрет (любая длинная строка).
 * 4. Deploy → New deployment → тип "Web app":
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    Скопируйте выданный URL — это GOOGLE_SHEET_WEBHOOK_URL.
 * 5. Тот же TOKEN пропишите в Cloudflare как GOOGLE_SHEET_TOKEN.
 */

const TOKEN = "CHANGE_ME_длинная_секретная_строка";
const SHEET_NAME = "Заявки";

// Пропишите здесь же — Apps Script отправит уведомление в Telegram.
// (На российском хостинге PHP часто не достучится до api.telegram.org.)
const TELEGRAM_BOT_TOKEN = "CHANGE_ME_токен_бота";
const TELEGRAM_CHAT_ID = "CHANGE_ME_chat_id";

// Google Sheets воспринимает +, =, -, @ в начале ячейки как формулу → #ERROR!
function sheetText(value) {
  const s = String(value ?? "");
  if (!s) return "";
  if (/^[=+\-@]/.test(s)) return "'" + s;
  return s;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function sendTelegram(data) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;

  const text =
    "<b>🚀 Новая заявка на разбор</b>\n\n" +
    "<b>Имя:</b> " + escapeHtml(data.name) + "\n" +
    "<b>Контакт:</b> " + escapeHtml(data.contact) + "\n" +
    (data.budget ? "<b>Бюджет:</b> " + escapeHtml(data.budget) + "\n" : "") +
    (data.message ? "<b>Задача:</b> " + escapeHtml(data.message) + "\n" : "") +
    "\n<i>" + Utilities.formatDate(new Date(), "Europe/Moscow", "dd.MM.yyyy, HH:mm:ss") + "</i>";

  try {
    UrlFetchApp.fetch("https://api.telegram.org/bot" + TELEGRAM_BOT_TOKEN + "/sendMessage", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
      muteHttpExceptions: true,
    });
  } catch (err) {
    // Таблица важнее: не роняем заявку, если Telegram временно недоступен.
  }
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);

    if (TOKEN && data.token !== TOKEN) {
      return out({ ok: false, error: "forbidden" });
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(["Дата", "Имя", "Контакт", "Бюджет", "Задача"]);
      sheet.getRange("C:C").setNumberFormat("@");
    }

    const date = data.date ? new Date(data.date) : new Date();
    sheet.appendRow([
      date,
      data.name || "",
      sheetText(data.contact),
      sheetText(data.budget),
      data.message || "",
    ]);

    sendTelegram(data);

    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err) });
  }
}

function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
