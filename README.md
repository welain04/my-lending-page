# vibestudio — продающий лендинг

Лендинг фриланс-услуги: сайты, Telegram-боты и AI-помощники для бизнеса на вайбкодинге.
Одно целевое действие — заявка на бесплатный разбор, которая мгновенно падает в Telegram
(и, опционально, дублируется в Google-таблицу).

## Стек

- **Astro 5** + **Tailwind CSS 4** — статичная быстрая страница, SEO, компонентная структура.
- **Cloudflare Pages Functions** — приём заявки (`/api/lead`) и отправка в Telegram, без базы данных.
- **Хостинг:** Cloudflare Pages — бесплатно, глобальный CDN, always-on.

## Структура экранов (порядок не менять)

1. Hero — что это и зачем
2. Боль — узнавание проблемы
3. Решение — 3 инструмента = выгоды
4. Как работает — 4 шага
5. Соц. доказательство — **скрыт** (`Proof.astro`), вернуть при появлении реальных кейсов
6. Цена — 3 пакета, цена «индивидуально»
7. FAQ — 6 возражений
8. Финальный CTA

## Локальная разработка

```bash
npm install
npm run dev        # http://localhost:4321  (только сама страница)
```

Форма (`/api/lead`) работает только там, где выполняются Cloudflare Functions.
Чтобы протестировать её локально:

```bash
npm run build
npx wrangler pages dev dist   # поднимет и статику, и функции (http://127.0.0.1:8788)
```

Для локального теста создайте `.dev.vars` из `.dev.vars.example`.

## Настройка Telegram-уведомлений

1. Создайте бота у [@BotFather](https://t.me/BotFather) → получите `TELEGRAM_BOT_TOKEN`.
2. Напишите боту любое сообщение, затем узнайте свой `chat_id` через [@userinfobot](https://t.me/userinfobot).
3. В Cloudflare Pages → **Settings → Environment variables** добавьте:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`

## Запись заявок в Google-таблицу (необязательно)

Заявка всегда идёт в Telegram; дополнительно её можно дописывать в Google Sheet.

1. Создайте Google-таблицу → **Расширения → Apps Script**.
2. Вставьте код из `google-apps-script.gs`, замените `TOKEN` на свою секретную строку.
3. **Deploy → New deployment → Web app**: *Execute as — Me*, *Who has access — Anyone*.
4. Скопируйте URL веб-приложения.
5. Добавьте переменные (локально в `.dev.vars`, на проде в Cloudflare):
   - `GOOGLE_SHEET_WEBHOOK_URL` — этот URL
   - `GOOGLE_SHEET_TOKEN` — та же строка, что `TOKEN` в скрипте

Если переменные не заданы — запись в таблицу просто пропускается.

## Деплой на Cloudflare Pages

Вариант через Git (рекомендуется):

1. Запушьте репозиторий на GitHub.
2. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
3. Настройки сборки:
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Добавьте переменные окружения (см. выше) и задеплойте.

Функции из папки `functions/` подхватываются автоматически.

## Что заполнить перед запуском

- Реальные отзывы/кейсы в `src/components/Proof.astro` и вернуть его в `src/pages/index.astro`.
- Цены (сейчас «индивидуально»), если решите показывать.
- Домен `site` в `astro.config.mjs`.
