# Передача работы (читать первым)

Проект ведётся по этапам, иногда с разных аккаунтов Claude. Этот файл — единственный
источник правды о том, где мы остановились. **После каждого завершённого этапа (или
его части) обнови раздел «Статус» и «Следующий шаг», закоммить и запушь.**

Ветка: `local-server-telegram-security` (worktree `.worktrees/codex-local-no-supabase`).
Git из песочницы ругается на владельца — использовать `git -c safe.directory=* ...`.

## Архитектура (решено пользователем, не пересматривать)
- Сервер на этом ПC (Windows), без VPS. Порт **3040**.
- Доступ снаружи: Cloudflare Tunnel `turonproject.uz` (служба `cloudflared`, управляется
  из панели Cloudflare → Networking → Tunnels → Routes). Маршрут
  `tracker.turonproject.uz → http://localhost:3040` (тип HTTP, не HTTPS).
  В том же туннеле `turonproject.uz → :3456` и `finance.turonproject.uz → :3333` — не трогать.
- Вход через домен: логин + пароль (`lib/auth.ts`, `proxy.ts`). Учётка создаётся только
  локально в Настройки → Безопасность. В домашней сети пароль не нужен.
- Бэкапы: зашифрованные, ежедневно 03:00 в `G:\Мой диск\mygov-backup` (Google Drive).
- Android: нативное приложение, только APK, обновления через облако.
- Дизайн: утверждён в Figma `prAwvvAsVfiqGaLpJKpsSb` (страницы «Desktop · ПК», «Android»).
  Нейтральная палитра, Inter, чёрные кнопки, один синий акцент, статус = точка + текст.
  **Никакого «нейрослопа»:** градиенты, свечения, цветные полосы, иконки в цветных
  квадратах, UPPERCASE-теги — запрещены.

## Запуск / перезапуск
- Прод: `node scripts/background-server.mjs` (собирает при изменениях, запускает
  `scripts/supervisor.mjs` → `server.mjs`). Лог: `logs/server.log`.
- Перезапуск: убить дерево супервизора (родитель процесса на порту 3040,
  `taskkill /PID <pid> /T /F`), затем снова `background-server.mjs`.
- Проверки: `npx tsc --noEmit`, `npx eslint app components lib`, `npx jest`.
- Не запускать `next build` при работающем проде; для превью — отдельный порт и
  `LOCAL_APP_ROOT` на копию данных.

## Правила
- Никогда не коммитить `data/`, `.env.local`, логи, PDF. Не выводить в чат секреты
  (`BACKUP_KEY`, `SESSION_SECRET`, `APP_TOKEN`, токен бота).
- Пароли/коды пользователь вводит сам. Коммит и пуш в эту ветку разрешены по плану.
- Общаться с пользователем по-русски, коротко.

## Статус этапов
| # | Этап | Статус |
|---|------|--------|
| 0 | Код в git | ✅ |
| 1 | Бэкапы в Google Drive | ✅ |
| 2 | Вход по логину/паролю | ✅ |
| 3 | Надёжность: супервизор, один бот, ротация логов, быстрая БД | ✅ |
| 4 | Утверждённый дизайн на сайте | ✅ |
| 5 | Cloudflare Tunnel + домен | ✅ (вход через домен проверен 2026-10-20) |
| 6 | Мобильный API + push (FCM) | ✅ (ключ проверен 2026-10-20; живой push проверить на этапе 7) |
| 7 | Android-приложение (Expo / React Native) | ⏳ следующий |
| 8 | Обновления через облако (APK-апдейтер + OTA) | — |

## Следующий шаг
Этап 6 — серверная часть сделана (2026-10-20):
- `lib/push.ts`: таблица `push_devices` (токен привязан к сессии; отозвал сессию — push
  прекращается), отправка через FCM HTTP v1 без зависимостей, мёртвые токены удаляются.
- `POST/DELETE /api/push/register` (Bearer device-токен из `POST /api/auth/login` с `device`).
- Push уходит при каждом изменении статуса (`lib/server-scheduler.ts`, рядом с Telegram).
- Ключ: `data/firebase-service-account.json` (в gitignore). Без него push выключен.

Firebase: проект `mygov-tracker`, Android package `uz.turonproject.tracker`. Сервисный
ключ лежит в `data/firebase-service-account.json`, OAuth + FCM API проверены (dry-run).
`google-services.json` у пользователя — попросить его на этапе 7 для сборки APK.

**Этап 7 — Android-приложение.** Перед началом подтвердить у пользователя стек
(предложено: Expo / React Native, отдельная папка `mobile/`). Экраны — по Figma
(страница «Android»). Вход: `POST /api/auth/login` с `device: {name}` → Bearer-токен
(хранить в SecureStore), затем `POST /api/push/register` с FCM-токеном. Базовый URL
`https://tracker.turonproject.uz`. После сборки APK — проверить живой push.

## Заметки
- Telegram-вебхук на tele.goldenherd.com удалён по просьбе пользователя; бот работает
  через getUpdates, лок `data/telegram-bot.lock` с heartbeat.
- Пользователю рекомендовано отключить спящий режим ПК (сам).
