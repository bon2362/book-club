import {
  ACTIVE_POLL_INTERVAL_MS,
  IDLE_POLL_INTERVAL_MS,
  PRESENCE_WINDOW_MS,
  adaptivePollInterval,
} from '../poll-interval'

describe('adaptivePollInterval (layer B)', () => {
  it('опрашивает редко, когда участник один (≤1 онлайн)', () => {
    expect(adaptivePollInterval(0)).toBe(IDLE_POLL_INTERVAL_MS)
    expect(adaptivePollInterval(1)).toBe(IDLE_POLL_INTERVAL_MS)
  })

  it('опрашивает часто, когда есть с кем синхронизироваться (≥2 онлайн)', () => {
    expect(adaptivePollInterval(2)).toBe(ACTIVE_POLL_INTERVAL_MS)
    expect(adaptivePollInterval(5)).toBe(ACTIVE_POLL_INTERVAL_MS)
  })

  // Инвариант присутствия: опрос версии — это же heartbeat. Idle-интервал, превышающий
  // окно «онлайн», сделает одинокого участника невидимым для зашедшего. Если этот тест
  // падает — нельзя просто поднять idle-интервал, сперва увеличь PRESENCE_WINDOW_MS.
  it('idle-интервал помещается в окно присутствия', () => {
    expect(IDLE_POLL_INTERVAL_MS).toBeLessThan(PRESENCE_WINDOW_MS)
  })
})
