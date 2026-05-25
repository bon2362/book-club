# Уведомления и письма

В проекте есть два основных email-сценария:

- magic link для входа;
- digest-уведомления о новых записях.

Оба используют Resend.

## Magic link

Когда пользователь входит по email, NextAuth через Resend отправляет ссылку для входа. Отправитель:

`Долгое наступление <noreply@slowreading.club>`

## Digest о новых записях

Digest нужен, чтобы не отправлять письмо на каждое действие сразу. Вместо этого сайт складывает события в очередь, а GitHub Actions регулярно дергает cron-endpoint.

```mermaid
sequenceDiagram
    participant U as Участник
    participant S as /api/signup
    participant Q as notification_queue
    participant GH as GitHub Actions digest.yml
    participant C as /api/cron/digest
    participant R as Resend
    participant A as ADMIN_EMAIL

    U->>S: Записывается на книгу
    S->>Q: Добавляет строки уведомлений
    GH->>C: GET с Bearer CRON_SECRET
    C->>Q: Забирает готовые unsent rows
    C->>R: Отправляет digest
    R->>A: Email владельцу
    C->>Q: Помечает sentAt
```

## Защита cron

`/api/cron/digest` требует заголовок:

```text
Authorization: Bearer CRON_SECRET
```

Если `CRON_SECRET` в GitHub Secrets или Vercel env не совпадает с ожидаемым, digest не отправится.

## Telegram preauth cleanup

Есть отдельный Vercel Cron:

- путь: `/api/cron/telegram-preauth-cleanup`;
- расписание: каждый день в 03:00 UTC.

Он чистит старые Telegram pre-auth токены.

## Email-ресурсы

| Ресурс | Назначение |
| --- | --- |
| Resend API key | Отправка magic link и писем. |
| `noreply@slowreading.club` | Отправитель служебных писем. |
| `hello@slowreading.club` | Адрес для обратной связи и входящей почты. |
| Namecheap email forwarding | Пересылает входящие письма на личный Gmail. |

## Что проверять при проблемах

| Симптом | Что проверить |
| --- | --- |
| Magic link не приходит | `RESEND_API_KEY`, домен Resend, spam, email provider. |
| Digest не отправляется | GitHub Actions `Notification Digest`, `CRON_SECRET`, `notification_queue`. |
| Очередь растет | `/api/admin/digest-status`, Resend errors, debounce window. |
| Письма приходят не от того адреса | Resend domain settings и `FROM` в auth/email templates. |
