import { createHmac } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../fixtures'

type MatchingState = { session: { stateVersion: number } }

async function state(request: APIRequestContext, sessionId: string): Promise<MatchingState> {
  const response = await request.get(`/api/matching/state?session=${sessionId}`)
  expect(response.ok(), await response.text()).toBe(true)
  return response.json() as Promise<MatchingState>
}

async function hard(request: APIRequestContext, sessionId: string, bookId: string) {
  const current = await state(request, sessionId)
  const response = await request.post(`/api/matching/sessions/${sessionId}/book-actions`, {
    data: { action: 'setHard', bookId, expectedStateVersion: current.session.stateVersion },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

async function conditional(request: APIRequestContext, sessionId: string, bookId: string) {
  const current = await state(request, sessionId)
  const response = await request.post(`/api/matching/sessions/${sessionId}/book-actions`, {
    data: { action: 'setConditional', bookId, expectedStateVersion: current.session.stateVersion },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

function signedInitData(telegramId: number) {
  const token = process.env.TELEGRAM_BOT_TOKEN ?? localTelegramBotToken()
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required for Telegram Mini App E2E')
  const params = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: `e2e-${telegramId}`,
    user: JSON.stringify({ id: telegramId, first_name: 'E2E' }),
  }
  const check = Object.entries(params).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  const hash = createHmac('sha256', secret).update(check).digest('hex')
  return new URLSearchParams({ ...params, hash }).toString()
}

function localTelegramBotToken() {
  const path = resolve(__dirname, '../../..', '.env.local')
  if (!existsSync(path)) return undefined
  const line = readFileSync(path, 'utf8').split('\n').find((value) => value.startsWith('TELEGRAM_BOT_TOKEN='))
  return line?.slice('TELEGRAM_BOT_TOKEN='.length).trim().replace(/^['"]|['"]$/g, '') || undefined
}

function futureSlot() {
  const result = new Date(Date.now() + 48 * 60 * 60 * 1000)
  result.setUTCMinutes(0, 0, 0)
  result.setUTCHours(14)
  return result.toISOString()
}

test('two Telegram actors can create only one meeting for one candidate slot', async ({ matchingBooksFixture, dbExec }) => {
  test.setTimeout(120_000)
  const { session, books, participantA, getParticipantB, getParticipantC } = matchingBooksFixture
  const [participantB, participantC] = await Promise.all([getParticipantB(), getParticipantC()])
  await conditional(participantC.request, session.id, books[0].id)
  await hard(participantA.request, session.id, books[0].id)
  await hard(participantB.request, session.id, books[0].id)

  const resolver = await participantA.request.get(`/calendar/circle/${books[0].id}/1`)
  expect(resolver.ok(), await resolver.text()).toBe(true)
  const slug = new URL(resolver.url()).pathname.split('/').pop()
  if (!slug) throw new Error('calendar slug missing after resolver redirect')
  const telegramA = 710000001
  const telegramB = 710000002
  await dbExec(`insert into user_identities (id, user_id, provider, provider_account_id) values ($1, $2, 'telegram', $3), ($4, $5, 'telegram', $6)`, [
    `__e2e_tg_identity_${telegramA}__`, participantA.userId, String(telegramA),
    `__e2e_tg_identity_${telegramB}__`, participantB.userId, String(telegramB),
  ])
  dbExec.registerCleanup(`delete from user_identities where provider = 'telegram' and provider_account_id = any($1::text[])`, [[String(telegramA), String(telegramB)]])

  const startsAt = futureSlot()
  for (const participant of [participantA, participantB]) {
    const availability = await participant.request.put('/api/calendar/availability', { data: { intervals: [{ startsAt, endsAt: new Date(new Date(startsAt).getTime() + 60 * 60 * 1000).toISOString() }] } })
    expect(availability.ok(), await availability.text()).toBe(true)
  }
  const headersA = { Authorization: `tma ${signedInitData(telegramA)}` }
  const headersB = { Authorization: `tma ${signedInitData(telegramB)}` }
  const [first, second] = await Promise.all([
    participantA.request.post(`/api/tg/calendar/${slug}/meetings`, { headers: headersA, data: { startsAt } }),
    participantB.request.post(`/api/tg/calendar/${slug}/meetings`, { headers: headersB, data: { startsAt } }),
  ])
  expect([first.status(), second.status()].filter(status => status === 201)).toHaveLength(1)
  expect([first.status(), second.status()].filter(status => status === 409)).toHaveLength(1)
})
