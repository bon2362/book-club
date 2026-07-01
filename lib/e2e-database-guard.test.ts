import { createSafeE2EDatabaseClient } from './e2e-database-guard'

const SAFE_URL = 'postgres://user:pwd@ep-e2e-host-7777.neon.tech/db'

function safeEnv(overrides: Record<string, string | undefined> = {}) {
  return {
    NODE_ENV: 'development',
    NEXTAUTH_TEST_MODE: 'true',
    DATABASE_URL: SAFE_URL,
    E2E_REQUIRE_DB_MARKER: 'ep-e2e-host-7777',
    PROD_DB_HOST_MARKER: 'ep-prod-host-9999',
    ...overrides,
  }
}

test.each([
  ['test mode disabled', { NEXTAUTH_TEST_MODE: undefined }],
  ['required marker missing', { E2E_REQUIRE_DB_MARKER: undefined }],
  ['required marker does not match', { E2E_REQUIRE_DB_MARKER: 'other-e2e-host' }],
  ['production marker missing', { PROD_DB_HOST_MARKER: undefined }],
  ['production host selected', { DATABASE_URL: 'postgres://user:pwd@ep-prod-host-9999.neon.tech/db' }],
  ['database URL missing', { DATABASE_URL: undefined }],
  ['database URL invalid', { DATABASE_URL: 'not-a-postgres-url-ep-e2e-host-7777' }],
])('fails closed before constructing a DB client when %s', (_label, overrides) => {
  const factory = jest.fn()
  expect(() => createSafeE2EDatabaseClient(factory, safeEnv(overrides))).toThrow(/E2E database guard/)
  expect(factory).not.toHaveBeenCalled()
})

test('constructs the client exactly once for an explicitly isolated E2E URL', () => {
  const client = { query: jest.fn() }
  const factory = jest.fn(() => client)
  expect(createSafeE2EDatabaseClient(factory, safeEnv())).toBe(client)
  expect(factory).toHaveBeenCalledTimes(1)
  expect(factory).toHaveBeenCalledWith(SAFE_URL)
  expect(client.query).not.toHaveBeenCalled()
})

test('production-runtime E2E additionally requires the existing explicit server opt-in', () => {
  const factory = jest.fn()
  expect(() => createSafeE2EDatabaseClient(factory, safeEnv({
    NODE_ENV: 'production',
    E2E_ALLOW_PRODUCTION_SERVER: undefined,
  }))).toThrow(/E2E database guard/)
  expect(factory).not.toHaveBeenCalled()

  const allowedFactory = jest.fn(() => ({ query: jest.fn() }))
  createSafeE2EDatabaseClient(allowedFactory, safeEnv({
    NODE_ENV: 'production',
    E2E_ALLOW_PRODUCTION_SERVER: 'true',
  }))
  expect(allowedFactory).toHaveBeenCalledTimes(1)
})
