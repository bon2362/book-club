# Привязка Telegram в профиле через бота (B3)

**Дата:** 2026-06-16
**Статус:** утверждён, автономный выкат до прода

## Проблема

Привязка Telegram в профиле (`ProfileDrawer` + `/api/account/identities/telegram/{state,callback}`) использует веб-виджет `oauth.telegram.org` — та же iOS-поломка, что мы устранили для входа (B2). Заменяем на бот-флоу (deep-link + поллинг). Подход A (привязку выполняет вебхук).

## Флоу (привязка к уже залогиненному аккаунту)

```
Профиль → «Привязать Telegram»
1. POST /api/account/identities/telegram/link-start (требует сессию)
   → createTelegramPreauthToken(currentUserId) → возвращает nonce
2. window.open(t.me/<bot>?start=link_<nonce>) → пользователь жмёт Start
3. Вебхук POST /api/telegram/webhook, payload '/start link_<nonce>':
   → consumeTelegramPreauthToken(nonce) → targetUserId
   → linkVerifiedIdentityToUser(targetUserId, 'telegram', from.id, …) в withAuditContext
     (source 'account-linking-bot'); IdentityConflictError → бот: «уже привязан к другому»
   → бот: «✅ Telegram привязан, вернитесь в браузер»
4. Профиль опрашивает GET /api/me раз в 2с (до 2 мин) → как только в user.authMethods
   появился provider 'telegram' → обновляет список + тост «Telegram привязан»
```

Ветка входа в вебхуке (nonce без префикса `link_`) — без изменений.

## Компоненты

### Новое: `POST /api/account/identities/telegram/link-start`
```ts
const session = await auth(); const userId = session?.user?.id
if (!userId) return 401
const { token } = await createTelegramPreauthToken(userId)
return NextResponse.json({ nonce: token })
```

### Вебхук `app/api/telegram/webhook/route.ts` — ветка link
В разборе `/start <payload>`: если `payload` начинается с `link_` →
```
const nonce = payload.slice('link_'.length)
const targetUserId = await consumeTelegramPreauthToken(nonce)
if (!targetUserId) → sendTelegramMessage(from.id, 'Ссылка устарела, попробуйте ещё раз из профиля.')
else: try { withAuditContext({actorUserId: targetUserId, source:'account-linking-bot'},
        tx => linkVerifiedIdentityToUser(targetUserId, 'telegram', String(from.id),
          { name, image: null, telegramUsername: from.username ?? null, now, metadata:{source:'account-linking-bot'} }, tx)) }
      catch IdentityConflictError → sendTelegramMessage(from.id, 'Этот Telegram уже привязан к другому аккаунту.')
      success → sendTelegramMessage(from.id, '✅ Telegram привязан! Вернитесь в браузер.')
```
Иначе (payload без `link_`) — существующая ветка входа (bindTelegramLoginNonce).

### Профиль `components/nd/ProfileDrawer.tsx`
- Удалить: эффект fetch `/state`, эффект загрузки telegram-widget, состояние `telegramLinkAuthUrl`.
- Слот `<div id="telegram-link-container">` (для provider==='telegram') заменить на кнопку «Привязать» (стиль как у email/google кнопок) → `startTelegramLink()`.
- `startTelegramLink()`: POST link-start → `{nonce}` → `window.open(t.me/<bot>?start=link_<nonce>)` → setState waiting → poll `/api/me` каждые 2с (timeout 120с): если telegram появился в authMethods → setAuthIdentities(новые) + тост «Telegram привязан» + stop; по таймауту → тост «Не удалось — проверьте сообщение в боте».
- Состояния: `tgLinkState: 'idle'|'waiting'`, таймер в ref, cleanup в unmount.

### Удалить (полная замена виджета)
- `app/api/account/identities/telegram/state/route.ts` (+ .test)
- `app/api/account/identities/telegram/callback/route.ts` (+ .test)
- `lib/account-linking-state.ts` (+ .test) — used только этими роутами.

## Переиспользуем
`createTelegramPreauthToken`/`consumeTelegramPreauthToken` (та же таблица, миграции нет), `linkVerifiedIdentityToUser` + `IdentityConflictError`, `sendTelegramMessage`, `GET /api/me` (поллинг), паттерн поллинга из AuthModal.

## Безопасность
Link-nonce чеканится только аутентифицированным запросом (привязан к userId сессии). Личность Telegram даёт нажавший Start; теоретический griefing-риск (соц-инженерия: уговорить нажать Start по чужой ссылке → привязка чужого Telegram) — низкий для книжного клуба, TTL 5 мин, `IdentityConflictError` не даёт перепривязать. Принято.

## Тесты
- `link-start`: без сессии → 401; с сессией → 200 + `createTelegramPreauthToken(userId)` вызван.
- webhook link-ветка: `link_<nonce>` валидный → `linkVerifiedIdentityToUser` + success-сообщение; consume→null → «ссылка устарела»; `IdentityConflictError` → conflict-сообщение; ветка входа не задета.
- Удалить тесты снятых роутов и `account-linking-state.test`.

## Выкат (автономный)
Стандартный PR → CI-gate → merge в main → main деплоит прод. Вебхук уже на боевом домене (один на бота, новая `link_`-ветка тем же эндпоинтом), новых env/setWebhook не нужно. Smoke на проде: link-start без сессии → 401; старые роуты → 404.
