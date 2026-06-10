'use client'

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

interface MatchingBoardContextValue {
  /** true с момента действия пользователя до прихода новых серверных данных. */
  pending: boolean
  /** Вызывается мутирующим компонентом сразу после своего действия. */
  beginPending: () => void
}

const defaultValue: MatchingBoardContextValue = {
  pending: false,
  beginPending: () => {},
}

export const MatchingBoardContext = createContext<MatchingBoardContextValue>(defaultValue)

export function useMatchingBoard(): MatchingBoardContextValue {
  return useContext(MatchingBoardContext)
}

/** Страховка: если новый stateVersion почему-то не пришёл, гасим loader сами. */
const SAFETY_TIMEOUT_MS = 6_000

/**
 * Держит флаг «идёт пересчёт» для панелей «Сценарии кругов» / «Мои ходы» (#315).
 *
 * Поток: пользователь меняет книги/приоритеты → мутирующий компонент зовёт
 * `beginPending()` (панели гаснут + спиннер) → его же `router.refresh()` пересчитывает
 * сценарии на сервере → сервер ре-рендерит провайдер с НОВЫМ `stateVersion` →
 * эффект гасит `pending` (панели плавно проявляются). `stateVersion` инкрементится
 * на каждую мутацию (`bumpSessionState`), поэтому loader всегда снимается; таймаут —
 * лишь страховка от зависания.
 */
export default function MatchingBoardProvider({
  stateVersion,
  children,
}: {
  stateVersion: number
  children: React.ReactNode
}) {
  const [pending, setPending] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastVersionRef = useRef(stateVersion)

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  const beginPending = useCallback(() => {
    setPending(true)
    clearTimer()
    timerRef.current = setTimeout(() => {
      setPending(false)
      timerRef.current = null
    }, SAFETY_TIMEOUT_MS)
  }, [clearTimer])

  // Новый stateVersion от сервера = router.refresh() завершился → снимаем loader.
  useEffect(() => {
    if (stateVersion === lastVersionRef.current) return
    lastVersionRef.current = stateVersion
    setPending(false)
    clearTimer()
  }, [stateVersion, clearTimer])

  useEffect(() => clearTimer, [clearTimer])

  return (
    <MatchingBoardContext.Provider value={{ pending, beginPending }}>
      {children}
    </MatchingBoardContext.Provider>
  )
}
