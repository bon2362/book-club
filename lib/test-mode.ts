// Guard for /api/test/* endpoints.
//
// Required env:
//   NEXTAUTH_TEST_MODE=true        — explicit opt-in for the dev server
//   NODE_ENV !== 'production'      — never enabled in prod runtime
//
// Optional safety net (defence in depth):
//   PROD_DB_HOST_MARKER=<substr>   — if set, test endpoints refuse to run when
//                                    DATABASE_URL contains this substring.
//                                    Set it to a fragment of the production
//                                    Neon hostname so a stray prod connection
//                                    cannot be mutated by tests.
//   E2E_REQUIRE_DB_MARKER=<substr> — if set, DATABASE_URL must contain this
//                                    substring. Use the e2e Neon branch host
//                                    to make sure tests can only run against
//                                    that branch.

export function isTestEndpointAllowed() {
  if (process.env.NODE_ENV === 'production') return false
  if (process.env.NEXTAUTH_TEST_MODE !== 'true') return false

  const dbUrl = process.env.DATABASE_URL ?? ''

  const prodMarker = process.env.PROD_DB_HOST_MARKER?.trim()
  if (prodMarker && dbUrl.includes(prodMarker)) return false

  const requiredMarker = process.env.E2E_REQUIRE_DB_MARKER?.trim()
  if (requiredMarker && !dbUrl.includes(requiredMarker)) return false

  return true
}
