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
      sheet.appendRow(["Дата", "Имя", "Контакт", "Задача"]);
    }

    const date = data.date ? new Date(data.date) : new Date();
    sheet.appendRow([date, data.name || "", data.contact || "", data.message || ""]);

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
