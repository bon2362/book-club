import { isTestEndpointAllowed } from './test-mode'

describe('isTestEndpointAllowed', () => {
  const ORIGINAL_ENV = process.env

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV }
    // Guard env vars: clear all of them so each test only sees what it sets.
    // Otherwise a developer's local .env.test.local can leak into Jest via the
    // shell environment and make tests non-deterministic.
    delete process.env.PROD_DB_HOST_MARKER
    delete process.env.E2E_REQUIRE_DB_MARKER
    delete process.env.NEXTAUTH_TEST_MODE
    delete process.env.E2E_ALLOW_PRODUCTION_SERVER
  })

  afterAll(() => {
    process.env = ORIGINAL_ENV
  })

  function setEnv(overrides: Record<string, string | undefined>) {
    for (const key of Object.keys(overrides)) {
      const value = overrides[key]
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
  }

  it('denies when NODE_ENV is production without the explicit opt-in', () => {
    setEnv({ NODE_ENV: 'production', NEXTAUTH_TEST_MODE: 'true' })
    expect(isTestEndpointAllowed()).toBe(false)
  })

  // [SEC] Production runtime (next start for E2E). All three conditions must
  // hold; each missing one must fail closed so real prod can never expose
  // /api/test/* (which can mint admin JWTs and delete users).
  const E2E_DB = 'postgres://user:pwd@ep-e2e-host-7777.neon.tech/db'

  it('[SEC] allows under production only with opt-in + both markers correctly set', () => {
    setEnv({
      NODE_ENV: 'production',
      NEXTAUTH_TEST_MODE: 'true',
      E2E_ALLOW_PRODUCTION_SERVER: 'true',
      DATABASE_URL: E2E_DB,
      E2E_REQUIRE_DB_MARKER: 'ep-e2e-host-7777',
      PROD_DB_HOST_MARKER: 'ep-prod-host-9999',
    })
    expect(isTestEndpointAllowed()).toBe(true)
  })

  it('[SEC] denies under production when opt-in flag is missing (markers alone are not enough)', () => {
    setEnv({
      NODE_ENV: 'production',
      NEXTAUTH_TEST_MODE: 'true',
      E2E_ALLOW_PRODUCTION_SERVER: undefined,
      DATABASE_URL: E2E_DB,
      E2E_REQUIRE_DB_MARKER: 'ep-e2e-host-7777',
      PROD_DB_HOST_MARKER: 'ep-prod-host-9999',
    })
    expect(isTestEndpointAllowed()).toBe(false)
  })

  it('[SEC] denies under production when E2E_REQUIRE_DB_MARKER is not set (no fail-open)', () => {
    setEnv({
      NODE_ENV: 'production',
      NEXTAUTH_TEST_MODE: 'true',
      E2E_ALLOW_PRODUCTION_SERVER: 'true',
      DATABASE_URL: E2E_DB,
      E2E_REQUIRE_DB_MARKER: undefined,
      PROD_DB_HOST_MARKER: 'ep-prod-host-9999',
    })
    expect(isTestEndpointAllowed()).toBe(false)
  })

  it('[SEC] denies under production when PROD_DB_HOST_MARKER is not set (no fail-open)', () => {
    setEnv({
      NODE_ENV: 'production',
      NEXTAUTH_TEST_MODE: 'true',
      E2E_ALLOW_PRODUCTION_SERVER: 'true',
      DATABASE_URL: E2E_DB,
      E2E_REQUIRE_DB_MARKER: 'ep-e2e-host-7777',
      PROD_DB_HOST_MARKER: undefined,
    })
    expect(isTestEndpointAllowed()).toBe(false)
  })

  it('[SEC] denies under production when DATABASE_URL points at the prod host', () => {
    setEnv({
      NODE_ENV: 'production',
      NEXTAUTH_TEST_MODE: 'true',
      E2E_ALLOW_PRODUCTION_SERVER: 'true',
      DATABASE_URL: 'postgres://user:pwd@ep-prod-host-9999.neon.tech/db',
      E2E_REQUIRE_DB_MARKER: 'ep-e2e-host-7777',
      PROD_DB_HOST_MARKER: 'ep-prod-host-9999',
    })
    expect(isTestEndpointAllowed()).toBe(false)
  })

  it('[SEC] opt-in flag is ignored outside production (dev path unaffected)', () => {
    setEnv({
      NODE_ENV: 'development',
      NEXTAUTH_TEST_MODE: 'true',
      E2E_ALLOW_PRODUCTION_SERVER: undefined,
      DATABASE_URL: E2E_DB,
    })
    expect(isTestEndpointAllowed()).toBe(true)
  })

  it('denies when NEXTAUTH_TEST_MODE is not "true"', () => {
    setEnv({ NODE_ENV: 'development', NEXTAUTH_TEST_MODE: undefined })
    expect(isTestEndpointAllowed()).toBe(false)
  })

  it('allows in dev with NEXTAUTH_TEST_MODE=true and no markers', () => {
    setEnv({
      NODE_ENV: 'development',
      NEXTAUTH_TEST_MODE: 'true',
      DATABASE_URL: 'postgres://user:pwd@ep-anything-123.neon.tech/db',
      PROD_DB_HOST_MARKER: undefined,
      E2E_REQUIRE_DB_MARKER: undefined,
    })
    expect(isTestEndpointAllowed()).toBe(true)
  })

  it('denies when DATABASE_URL contains PROD_DB_HOST_MARKER', () => {
    setEnv({
      NODE_ENV: 'development',
      NEXTAUTH_TEST_MODE: 'true',
      DATABASE_URL: 'postgres://user:pwd@ep-prod-host-9999.neon.tech/db',
      PROD_DB_HOST_MARKER: 'ep-prod-host-9999',
    })
    expect(isTestEndpointAllowed()).toBe(false)
  })

  it('allows when PROD_DB_HOST_MARKER is set and DATABASE_URL does not contain it', () => {
    setEnv({
      NODE_ENV: 'development',
      NEXTAUTH_TEST_MODE: 'true',
      DATABASE_URL: 'postgres://user:pwd@ep-e2e-host-7777.neon.tech/db',
      PROD_DB_HOST_MARKER: 'ep-prod-host-9999',
    })
    expect(isTestEndpointAllowed()).toBe(true)
  })

  it('denies when E2E_REQUIRE_DB_MARKER is set and DATABASE_URL lacks it', () => {
    setEnv({
      NODE_ENV: 'development',
      NEXTAUTH_TEST_MODE: 'true',
      DATABASE_URL: 'postgres://user:pwd@ep-something-else.neon.tech/db',
      E2E_REQUIRE_DB_MARKER: 'ep-e2e-host-7777',
    })
    expect(isTestEndpointAllowed()).toBe(false)
  })

  it('allows when E2E_REQUIRE_DB_MARKER is set and DATABASE_URL contains it', () => {
    setEnv({
      NODE_ENV: 'development',
      NEXTAUTH_TEST_MODE: 'true',
      DATABASE_URL: 'postgres://user:pwd@ep-e2e-host-7777.neon.tech/db',
      E2E_REQUIRE_DB_MARKER: 'ep-e2e-host-7777',
    })
    expect(isTestEndpointAllowed()).toBe(true)
  })

  it('ignores empty/whitespace marker values', () => {
    setEnv({
      NODE_ENV: 'development',
      NEXTAUTH_TEST_MODE: 'true',
      DATABASE_URL: 'postgres://user:pwd@ep-anything.neon.tech/db',
      PROD_DB_HOST_MARKER: '   ',
      E2E_REQUIRE_DB_MARKER: '',
    })
    expect(isTestEndpointAllowed()).toBe(true)
  })
})
