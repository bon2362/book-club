// Чтение расхода Neon через Consumption API (console.neon.tech/api/v2).
// Живёт отдельно от route ради юнит-тестов (мокаем global.fetch).
// ВАЖНО: этот запрос идёт в management-API Neon (не в наш Postgres), поэтому
// НЕ будит compute нашей БД и не жжёт CU-часы. Ключ — серверный секрет NEON_API_KEY.

const NEON_CONSUMPTION_URL =
  'https://console.neon.tech/api/v2/consumption_history/v2/projects'

// Идентификатор орги book-club в Neon (не секрет — просто id, как VERCEL_PROJECT_ID).
const NEON_ORG_ID = 'org-ancient-poetry-63409397'

// Тариф Launch: $/CU-час. Меняется тарифом — поправить здесь.
const CU_HOUR_USD = 0.106

// Дефолтный лимит расходов для прогресс-бара. Совпадает со spend-лимитом в Neon.
// Переопределяется env-переменной NEON_SPEND_LIMIT_USD без правки кода.
const DEFAULT_SPEND_LIMIT_USD = 10

export interface NeonUsage {
  cuHours: number
  estSpendUsd: number
  spendLimitUsd: number
  /** ISO начала биллинг-периода (1-е число текущего месяца UTC). */
  periodStart: string
  updatedAt: string
}

interface ConsumptionResponse {
  projects?: Array<{
    periods?: Array<{
      consumption?: Array<{
        metrics?: Array<{ metric_name: string; value: number }>
      }>
    }>
  }>
}

function sumMetric(data: ConsumptionResponse, name: string): number {
  let sum = 0
  for (const project of data.projects ?? [])
    for (const period of project.periods ?? [])
      for (const point of period.consumption ?? [])
        for (const metric of point.metrics ?? [])
          if (metric.metric_name === name) sum += metric.value
  return sum
}

const round2 = (n: number) => Math.round(n * 100) / 100

export async function fetchNeonUsage(
  fetchImpl: typeof fetch = fetch,
  now: Date = new Date(),
): Promise<NeonUsage> {
  const apiKey = process.env.NEON_API_KEY
  if (!apiKey) throw new Error('NEON_API_KEY not set')

  // Биллинг-период Neon — календарный месяц (сброс 1-го числа).
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  const params = new URLSearchParams({
    from: periodStart.toISOString(),
    to: now.toISOString(),
    granularity: 'daily', // monthly округляет `to` к границе месяца → пустой диапазон
    org_id: NEON_ORG_ID,
    metrics: 'compute_unit_seconds',
  })

  const res = await fetchImpl(`${NEON_CONSUMPTION_URL}?${params}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`Neon API ${res.status}`)

  const data = (await res.json()) as ConsumptionResponse
  const cuHours = sumMetric(data, 'compute_unit_seconds') / 3600
  const spendLimitUsd = Number(process.env.NEON_SPEND_LIMIT_USD) || DEFAULT_SPEND_LIMIT_USD

  return {
    cuHours: round2(cuHours),
    estSpendUsd: round2(cuHours * CU_HOUR_USD),
    spendLimitUsd,
    periodStart: periodStart.toISOString(),
    updatedAt: now.toISOString(),
  }
}
