import { handleLead } from "./lead.js";

/**
 * Worker + Static Assets.
 * - POST /api/lead   → обработка заявки (Telegram + Google-таблица)
 * - всё остальное    → статичные файлы Astro из ./dist (binding ASSETS)
 *
 * Статические ассеты отдаются автоматически ещё до вызова воркера;
 * воркер срабатывает только для путей без соответствующего файла.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/lead") {
      if (request.method !== "POST") {
        return new Response(
          JSON.stringify({ ok: false, error: "method_not_allowed" }),
          { status: 405, headers: { "Content-Type": "application/json" } },
        );
      }
      return handleLead(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};
