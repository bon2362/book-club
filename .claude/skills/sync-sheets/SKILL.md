---
name: sync-sheets
description: Принудительно обновить кэш книг из Google Sheets через API
disable-model-invocation: true
---

Вызови POST /api/admin/sync для принудительной синхронизации каталога книг из Google Sheets.

Используй базовый URL из `.env.local` (NEXTAUTH_URL) или https://www.slowreading.club.

Для вызова нужна авторизованная сессия admin-пользователя — напомни пользователю
войти в систему как admin перед синхронизацией, или вызови endpoint напрямую
через curl с session cookie если доступен.

После синхронизации убедись что `/api/books` возвращает актуальные данные.
