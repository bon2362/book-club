type E2EGuardEnv = Record<string, string | undefined>

function deny(reason: string): never {
  throw new Error(`E2E database guard: ${reason}`)
}

/**
 * A stricter companion to the /api/test guard for raw Playwright SQL.
 * Raw SQL is destructive and bypasses route middleware, so both host markers
 * are mandatory in every runtime, not merely optional defence in depth.
 */
export function requireSafeE2EDatabaseUrl(env: E2EGuardEnv = process.env): string {
  if (env.NEXTAUTH_TEST_MODE !== 'true') deny('NEXTAUTH_TEST_MODE must be true')

  const databaseUrl = env.DATABASE_URL?.trim()
  const requiredMarker = env.E2E_REQUIRE_DB_MARKER?.trim()
  const prodMarker = env.PROD_DB_HOST_MARKER?.trim()
  if (!databaseUrl) deny('DATABASE_URL is required')
  if (!requiredMarker) deny('E2E_REQUIRE_DB_MARKER is required')
  if (!prodMarker) deny('PROD_DB_HOST_MARKER is required')
  if (databaseUrl.includes(prodMarker)) deny('production database host is forbidden')
  if (!databaseUrl.includes(requiredMarker)) deny('DATABASE_URL does not match E2E_REQUIRE_DB_MARKER')

  let parsed: URL
  try {
    parsed = new URL(databaseUrl)
  } catch {
    deny('DATABASE_URL is invalid')
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname) {
    deny('DATABASE_URL must be a PostgreSQL URL with a hostname')
  }

  if (env.NODE_ENV === 'production' && env.E2E_ALLOW_PRODUCTION_SERVER !== 'true') {
    deny('E2E_ALLOW_PRODUCTION_SERVER must be true under production runtime')
  }
  return databaseUrl
}

export function createSafeE2EDatabaseClient<T>(
  factory: (databaseUrl: string) => T,
  env: E2EGuardEnv = process.env,
): T {
  const databaseUrl = requireSafeE2EDatabaseUrl(env)
  return factory(databaseUrl)
}
