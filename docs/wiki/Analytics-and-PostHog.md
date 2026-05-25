# Аналитика и PostHog

PostHog используется для продуктовой аналитики. Он подключается на клиенте и уважает Do Not Track.

## Что собирается

Клиентский слой умеет:

- инициализировать PostHog;
- отправлять pageview;
- идентифицировать авторизованного пользователя;
- сбрасывать identity при выходе.

Если `NEXT_PUBLIC_DISABLE_ANALYTICS=true`, аналитика отключается.

## Где PostHog встроен в проект

| Часть | Назначение |
| --- | --- |
| `components/PostHogProvider.tsx` | Оборачивает приложение и управляет pageview/identity. |
| `lib/analytics.ts` | Клиентские helper-функции PostHog. |
| `lib/posthog-server.ts` | Best-effort удаление PostHog person при удалении аккаунта. |
| `/api/admin/posthog-usage` | Админский endpoint для месячного usage. |
| `PostHogUsageWidget` | Виджет в админке: события за месяц и лимит. |

## Важные переменные

| Переменная | Зачем |
| --- | --- |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | Клиентская отправка событий. |
| `NEXT_PUBLIC_POSTHOG_HOST` | Host PostHog, обычно EU. |
| `POSTHOG_PERSONAL_API_KEY` | Server-side API: usage и удаление person. |
| `POSTHOG_PROJECT_ID` | ID проекта для PostHog API. |
| `NEXT_PUBLIC_DISABLE_ANALYTICS` | Отключает аналитику на клиенте. |

## Приватность

PostHog настроен так, чтобы:

- не создавать person profile для каждого анонимного посетителя;
- уважать Do Not Track;
- идентифицировать пользователя только после входа;
- при удалении аккаунта пытаться удалить PostHog person best-effort.

## Что проверять

| Симптом | Проверка |
| --- | --- |
| Виджет в админке говорит not configured | `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`. |
| Нет событий | `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`, host, DNT, блокировщики. |
| События не должны собираться в тестах | `NEXT_PUBLIC_DISABLE_ANALYTICS=true`. |
| После удаления пользователя остались данные | Проверить PostHog API key scope и manual cleanup. |
