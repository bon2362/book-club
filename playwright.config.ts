import { defineConfig, devices } from '@playwright/test'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// E2E-only env overrides.
//
// Goal: tests must NEVER write to the production DB. We achieve this by
// loading `.env.test.local` (typical contents: an isolated Neon-branch
// DATABASE_URL + safety markers) and injecting its values into webServer.env
// so Next.js picks them up with a higher precedence than `.env.local`.
//
// See `.env.test.local.example` and `lib/test-mode.ts` for the full contract.
function loadTestEnv(): Record<string, string> {
  const path = resolve(__dirname, '.env.test.local')
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (key) out[key] = value
  }
  return out
}

const TEST_ENV = loadTestEnv()

// Keys that the dev server / Next.js runtime needs to honour during the run.
// Anything in .env.test.local with these names overrides .env.local at boot.
const FORWARDED_KEYS = [
  'DATABASE_URL',
  'PROD_DB_HOST_MARKER',
  'E2E_REQUIRE_DB_MARKER',
  'NEXTAUTH_URL',
  'NEXTAUTH_SECRET',
  'AUTH_SECRET',
] as const

const forwardedEnv: Record<string, string> = {}
for (const key of FORWARDED_KEYS) {
  if (TEST_ENV[key]) forwardedEnv[key] = TEST_ENV[key]
}

// Sanity warning if someone forgot to set up the isolated DB. Doesn't block
// the run — `lib/test-mode.ts` will block /api/test/* if markers detect prod.
if (!Object.keys(TEST_ENV).length && !process.env.CI) {
  // eslint-disable-next-line no-console
  console.warn(
    '\n[playwright] No .env.test.local found. Tests will use .env.local — make sure DATABASE_URL is NOT pointing at production.\n' +
      'Copy .env.test.local.example to .env.test.local and fill in an isolated Neon branch.\n',
  )
}

// Порт сервера под тесты. По умолчанию 3000; можно переопределить через
// PLAYWRIGHT_PORT, если 3000 занят другим локальным процессом.
const PORT = process.env.PLAYWRIGHT_PORT || '3000'
// Secure-cookie scenarios opt into Next's local HTTPS server. CI keeps using
// the regular HTTP `next start`; production itself terminates TLS at Vercel.
const USE_LOCAL_HTTPS = process.env.PLAYWRIGHT_HTTPS === 'true' && !process.env.CI
const LOCAL_HTTPS_KEY = process.env.PLAYWRIGHT_HTTPS_KEY
const LOCAL_HTTPS_CERT = process.env.PLAYWRIGHT_HTTPS_CERT
const BASE_URL = `${USE_LOCAL_HTTPS ? 'https' : 'http'}://127.0.0.1:${PORT}`

function localDevCommand(): string {
  if (!USE_LOCAL_HTTPS) return `npm run dev -- -p ${PORT}`
  if (LOCAL_HTTPS_KEY && LOCAL_HTTPS_CERT) {
    return `npm run dev -- -p ${PORT} --experimental-https --experimental-https-key ${LOCAL_HTTPS_KEY} --experimental-https-cert ${LOCAL_HTTPS_CERT}`
  }
  return `npm run dev -- -p ${PORT} --experimental-https`
}

export default defineConfig({
  testDir: './e2e',
  globalSetup: require.resolve('./e2e/global-setup'),
  globalTeardown: require.resolve('./e2e/global-teardown'),
  // fullyParallel: false — внутри одного спека тесты идут серийно
  // (часть спеков шарит TEST_EMAIL между тестами), а воркеры
  // параллелятся на уровне спеков. У каждого спека уникальный
  // email-префикс и (для книг) per-test фикстура через createTestBook —
  // конфликта между спеками нет.
  fullyParallel: false,
  // retries: 1 — страховка от редких flaky-моментов (overload
  // dev-сервера, медленный Neon-compute, networkidle промахи).
  retries: 1,
  // Matching-сценарии в полном CI-suite могут занимать чуть больше
  // стандартных 30s: teardown тогда удаляет test books, а незавершённые
  // API-запросы падают FK-ошибками. Быстрые expect-таймауты остаются 5s.
  timeout: 60_000,
  // workers:1 — matching E2E опираются на единственную active session
  // (`matching_sessions_single_active_idx`) и `/matching` всегда читает её.
  // Параллельные спеки могут удалить/заменить active session друг у друга,
  // поэтому весь E2E suite должен идти последовательно.
  workers: 1,
  reporter: process.env.CI
    ? [['list'], ['allure-playwright', { outputFolder: 'allure-results', suiteTitle: false }]]
    : 'list',
  use: {
    baseURL: BASE_URL,
    ignoreHTTPSErrors: USE_LOCAL_HTTPS,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // На CI поднимаем production-сервер (`next start` по уже собранному
    // `.next`), а не dev. Причина — dev компилирует роут лениво при первом
    // обращении: первый хит каждой страницы платит за webpack-компиляцию
    // (секунды-десятки секунд), иногда React-контекст не успевает
    // подняться → `useContext` of null → таймаут 60-120s → ретрай по уже
    // скомпилированному роуту проходит за 15s. Это давало и медленный
    // suite, и регулярный флак. `next start` отдаёт прекомпилированный
    // билд сразу. Сборка делается отдельным шагом в CI (.github/workflows/
    // ci.yml, job e2e) перед запуском Playwright.
    // Локально оставляем dev для быстрого hot-reload цикла.
    command: process.env.CI
      ? `npm run start -- -p ${PORT}`
      : localDevCommand(),
    url: BASE_URL,
    ignoreHTTPSErrors: USE_LOCAL_HTTPS,
    // На CI всегда поднимаем свежий сервер; локально переиспользуем
    // уже запущенный dev, если он есть.
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NEXTAUTH_TEST_MODE: 'true',
      NEXT_PUBLIC_DISABLE_ANALYTICS: 'true',
      // На CI поднимаем production-сервер (NODE_ENV=production). Чтобы
      // /api/test/* guard (lib/test-mode.ts) пропустил тест-эндпоинты под
      // prod-рантаймом, нужен явный opt-in — инжектим его прямо в env
      // сервера, детерминированно, а не через merge process.env. Прод-БД
      // при этом защищена маркерами (E2E_REQUIRE_DB_MARKER / PROD_DB_HOST_MARKER).
      // AUTH_TRUST_HOST — NextAuth v5 в production требует доверенный хост.
      ...(process.env.CI ? { E2E_ALLOW_PRODUCTION_SERVER: 'true', AUTH_TRUST_HOST: 'true' } : {}),
      ...forwardedEnv,
    },
  },
})
