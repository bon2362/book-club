import { useEffect, useRef } from 'react'

interface Options {
  /** Когда false — интервал не запускается вовсе (и останавливается, если шёл). */
  enabled?: boolean
}

/**
 * Вызывает `callback` сразу и далее каждые `intervalMs`, но **только пока вкладка
 * активна** (`document.visibilityState === 'visible'`).
 *
 * Зачем: matching-страница опрашивает `/api/matching/version`. Фоновые/свёрнутые
 * вкладки опрашивать бессмысленно — пользователь их не видит, а каждый poll будит
 * serverless-функцию (provisioned memory на Vercel). Пауза при `hidden` убирает
 * этот холостой расход.
 *
 * При возврате на вкладку (`hidden → visible`) делается **немедленный догоняющий
 * вызов**, поэтому свежесть состояния не страдает: пользователь видит актуальные
 * данные сразу, не дожидаясь полного интервала.
 *
 * Паттерн с `savedCallback` (Dan Abramov useInterval) — чтобы смена идентичности
 * `callback` между рендерами не перезапускала таймер.
 */
export function useVisibleInterval(
  callback: () => void,
  intervalMs: number,
  { enabled = true }: Options = {},
) {
  const savedCallback = useRef(callback)
  savedCallback.current = callback

  useEffect(() => {
    if (!enabled) return

    let timer: ReturnType<typeof setInterval> | null = null
    const tick = () => savedCallback.current()

    const start = () => {
      if (timer !== null) return
      tick() // догоняющий вызов при старте/возврате на вкладку
      timer = setInterval(tick, intervalMs)
    }
    const stop = () => {
      if (timer === null) return
      clearInterval(timer)
      timer = null
    }
    const handleVisibility = () => {
      if (document.hidden) stop()
      else start()
    }

    if (!document.hidden) start()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      stop()
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [enabled, intervalMs])
}
