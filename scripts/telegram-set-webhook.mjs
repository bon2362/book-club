#!/usr/bin/env node
/**
 * Перерегистрирует webhook бота так, чтобы Telegram присылал и сообщения,
 * и нажатия inline-кнопок (нужно календарю в темах группы).
 *
 * Usage: node --env-file=.env.local scripts/telegram-set-webhook.mjs [site-url]
 * По умолчанию site-url = https://www.slowreading.club
 *
 * Токен и секрет читаются из окружения и не печатаются.
 */
const token = process.env.TELEGRAM_BOT_TOKEN
const secret = process.env.TELEGRAM_WEBHOOK_SECRET
const site = (process.argv[2] ?? 'https://www.slowreading.club').replace(/\/$/, '')

if (!token || !secret) {
  console.error('Нужны TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET в окружении.')
  process.exit(1)
}

const api = (method, body) => fetch(`https://api.telegram.org/bot${token}/${method}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body ?? {}),
}).then((res) => res.json())

const set = await api('setWebhook', {
  url: `${site}/api/telegram/webhook`,
  secret_token: secret,
  allowed_updates: ['message', 'callback_query'],
})
console.log('setWebhook:', set.ok ? 'ok' : `failed — ${set.description}`)

const info = await api('getWebhookInfo')
console.log('allowed_updates:', JSON.stringify(info.result?.allowed_updates ?? null))
console.log('host:', info.result?.url ? new URL(info.result.url).host : null)
process.exit(set.ok ? 0 : 1)
