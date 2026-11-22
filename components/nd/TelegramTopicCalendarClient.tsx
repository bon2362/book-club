'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import TelegramCalendarClient from './TelegramCalendarClient'

export const TOPIC_START_PARAM = /^calendar_([A-Za-z0-9-]{1,64})$/
const REFRESH_DELAY_MS = 800

/** start_param из Direct Link: сначала из SDK, иначе из адреса (tgWebAppStartParam). */
function readStartParam(): string | null {
  const fromSdk = window.Telegram?.WebApp?.initDataUnsafe?.start_param
  if (fromSdk) return fromSdk
  return new URLSearchParams(window.location.search).get('tgWebAppStartParam')
}

/**
 * Точка входа Main Mini App из темы группы: `t.me/<bot>?startapp=calendar_<bindingId>`.
 * Сервер по привязке и подписанному initData проверяет участие в круге и отдаёт
 * slug; дальше работает обычный `TelegramCalendarClient`.
 */
export default function TelegramTopicCalendarClient() {
  const [error, setError] = useState<string | null>(null)
  const [target, setTarget] = useState<{ bindingId: string; slug: string } | null>(null)
  const initData = useRef<string>('')
  const refreshTimer = useRef<number | null>(null)

  useEffect(() => {
    const app = window.Telegram?.WebApp
    initData.current = app?.initData ?? ''
    if (!initData.current) { setError('Откройте календарь из Telegram.'); return }
    const match = readStartParam()?.match(TOPIC_START_PARAM)
    if (!match) { setError('Ссылка на календарь неполная. Откройте его кнопкой «Полная сетка» в теме книги.'); return }
    const bindingId = match[1]
    void (async () => {
      const response = await fetch(`/api/tg/calendar/topic/${encodeURIComponent(bindingId)}`, { headers: { Authorization: `tma ${initData.current}` } })
      if (response.status === 403) {
        const body = await response.json().catch(() => ({})) as { error?: string }
        setError(body.error === 'telegram_identity_not_linked'
          ? 'Сначала привяжите Telegram к аккаунту на slowreading.club: «Профиль» → «Способы входа».'
          : 'Этот календарь доступен только участникам круга.')
        return
      }
      if (!response.ok) { setError('Не удалось открыть календарь этой темы. Попробуйте ещё раз из чата.'); return }
      const body = await response.json() as { slug?: string }
      if (!body.slug) { setError('Не удалось открыть календарь этой темы.'); return }
      setTarget({ bindingId, slug: body.slug })
    })().catch(() => setError('Не удалось открыть календарь этой темы. Попробуйте ещё раз из чата.'))
  }, [])

  const sendRefresh = useCallback((bindingId: string, keepalive = false) => {
    void fetch(`/api/tg/calendar/topic/${encodeURIComponent(bindingId)}`, {
      method: 'POST', headers: { Authorization: `tma ${initData.current}` }, keepalive,
    }).catch(() => {})
  }, [])

  const onSaved = useCallback(() => {
    if (!target) return
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null
      sendRefresh(target.bindingId)
    }, REFRESH_DELAY_MS)
  }, [sendRefresh, target])

  // Mini App могут закрыть сразу после клика — отложенное обновление не должно потеряться.
  useEffect(() => {
    if (!target) return
    const flush = () => {
      if (refreshTimer.current === null) return
      window.clearTimeout(refreshTimer.current)
      refreshTimer.current = null
      sendRefresh(target.bindingId, true)
    }
    window.addEventListener('pagehide', flush)
    return () => { window.removeEventListener('pagehide', flush); flush() }
  }, [sendRefresh, target])

  if (error) return <main style={shellStyle}><p role="alert">{error}</p></main>
  if (!target) return <main style={shellStyle}><p>Загружаем календарь…</p></main>
  return <TelegramCalendarClient slug={target.slug} onSaved={onSaved} />
}

const shellStyle = { minHeight: '100svh', maxWidth: 560, margin: '0 auto', padding: '16px', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--nd-sans)' }
