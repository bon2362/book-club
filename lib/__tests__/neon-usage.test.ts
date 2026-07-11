import { fetchNeonUsage } from '../neon-usage'

function mockConsumption(seconds: number[]) {
  return jest.fn(async () => ({
    ok: true,
    json: async () => ({
      projects: [
        {
          periods: [
            {
              consumption: seconds.map((value) => ({
                metrics: [{ metric_name: 'compute_unit_seconds', value }],
              })),
            },
          ],
        },
      ],
    }),
  })) as unknown as typeof fetch
}

describe('fetchNeonUsage', () => {
  const OLD_ENV = process.env

  beforeEach(() => {
    process.env = { ...OLD_ENV, NEON_API_KEY: 'napi_test' }
    delete process.env.NEON_SPEND_LIMIT_USD
  })
  afterEach(() => {
    process.env = OLD_ENV
  })

  it('суммирует compute_unit_seconds в CU-часы и считает расход', async () => {
    // 3600 + 7200 = 10800 сек = 3 CU-часа
    const usage = await fetchNeonUsage(mockConsumption([3600, 7200]), new Date('2026-07-11T12:00:00Z'))
    expect(usage.cuHours).toBe(3)
    expect(usage.estSpendUsd).toBe(0.32) // 3 * 0.106 = 0.318 → round2
    expect(usage.spendLimitUsd).toBe(10) // дефолт
    expect(usage.periodStart).toBe('2026-07-01T00:00:00.000Z') // 1-е число месяца UTC
  })

  it('уважает NEON_SPEND_LIMIT_USD из env', async () => {
    process.env.NEON_SPEND_LIMIT_USD = '5'
    const usage = await fetchNeonUsage(mockConsumption([3600]), new Date('2026-07-11T12:00:00Z'))
    expect(usage.spendLimitUsd).toBe(5)
  })

  it('падает, если ключ не задан', async () => {
    delete process.env.NEON_API_KEY
    await expect(fetchNeonUsage(mockConsumption([3600]))).rejects.toThrow('NEON_API_KEY')
  })

  it('падает при не-2xx ответе Neon API', async () => {
    const badFetch = jest.fn(async () => ({ ok: false, status: 429 })) as unknown as typeof fetch
    await expect(fetchNeonUsage(badFetch)).rejects.toThrow('Neon API 429')
  })
})
