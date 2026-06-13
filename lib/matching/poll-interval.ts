import { PRESENCE_WINDOW_MS } from './presence-window'

/** Интервал опроса версии сессии, когда в сессии есть с кем синхронизироваться (≥2 онлайн). */
export const ACTIVE_POLL_INTERVAL_MS = 3_000

/**
 * Интервал, когда участник в сессии один: синхронизировать не с кем — опрашиваем реже.
 *
 * ⚠️ ОГРАНИЧЕНИЕ (наше, не платформенное): должен быть строго меньше
 * `PRESENCE_WINDOW_MS`. Опрос `/api/matching/version` одновременно служит heartbeat'ом
 * присутствия (`touchAndGetOnlinePseudonyms`). Если опрашивать реже окна «онлайн»,
 * одинокий участник выпадет из списка online для только что зашедшего — тот увидит его
 * офлайном до следующего редкого опроса. Инвариант закреплён тестом
 * `poll-interval.test.ts`. Хочешь поднять idle-интервал выше 12с — сперва увеличь
 * `PRESENCE_WINDOW_MS` (и проверь UX «кто онлайн»).
 */
export const IDLE_POLL_INTERVAL_MS = 10_000

/**
 * Слой B «умного polling»: адаптивный интервал по числу онлайн-участников.
 * `onlineCount` включает самого опрашивающего (heartbeat), поэтому «один» = ≤1.
 */
export function adaptivePollInterval(onlineCount: number): number {
  return onlineCount >= 2 ? ACTIVE_POLL_INTERVAL_MS : IDLE_POLL_INTERVAL_MS
}

// Реэкспорт для тестов-инвариантов и читаемости вызывающего кода.
export { PRESENCE_WINDOW_MS }
