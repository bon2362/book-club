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

export default defineConfig({
  testDir: './e2e',
  globalSetup: require.resolve('./e2e/global-setup'),
  globalTeardown: require.resolve('./e2e/global-teardown'),
  // fullyParallel: false — внутри одного спека тесты идут серийно
  // (часть спеков шарит TEST_EMAIL между тестами), а воркеры
  // параллелятся на уровне спеков. У каждого спека уникальный
  // email-префикс — конфликта между спеками нет.
  fullyParallel: false,
  // retries: 1 — страховка от редких flaky-моментов (overload
  // dev-сервера, медленный Neon-compute, networkidle промахи).
  retries: 1,
  // workers: 2 — компромисс. Workers: 4 даёт race condition
  // между спеками, которые читают каталог пока другие меняют
  // статусы seed-books. Workers: 2 стабилен. Чтобы поднять
  // дальше — нужно изолировать seed-books в фикстуру per-spec.
  workers: 2,
  reporter: process.env.CI
    ? [['list'], ['allure-playwright', { outputFolder: 'allure-results', suiteTitle: false }]]
    : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: true,
    timeout: 120_000,
    env: {
      NEXTAUTH_TEST_MODE: 'true',
      NEXT_PUBLIC_DISABLE_ANALYTICS: 'true',
      ...forwardedEnv,
    },
  },
})
