// Guard for /api/test/* endpoints.
//
// Required env:
//   NEXTAUTH_TEST_MODE=true        — explicit opt-in for the test runner
//
// Production runtime (NODE_ENV='production', i.e. `next start`):
//   By default test endpoints are OFF under production runtime. The CI E2E job
//   runs a production build (`next start`) for speed/stability, so we allow it
//   ONLY when ALL of the following hold — otherwise fail closed:
//     E2E_ALLOW_PRODUCTION_SERVER=true — explicit opt-in for prod-runtime E2E
//     E2E_REQUIRE_DB_MARKER set AND matched   (must point at the e2e branch)
//     PROD_DB_HOST_MARKER set AND NOT matched  (must not be the prod host)
//   On the real Vercel production none of these are set, so test endpoints
//   stay disabled by multiple independent conditions.
//
// Safety net markers (defence in depth, evaluated in every runtime):
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
  if (process.env.NEXTAUTH_TEST_MODE !== 'true') return false

  const dbUrl = process.env.DATABASE_URL ?? ''

  const prodMarker = process.env.PROD_DB_HOST_MARKER?.trim()
  if (prodMarker && dbUrl.includes(prodMarker)) return false

  const requiredMarker = process.env.E2E_REQUIRE_DB_MARKER?.trim()
  if (requiredMarker && !dbUrl.includes(requiredMarker)) return false

  // Production runtime: demand the explicit opt-in AND both DB markers
  // positively configured (e2e marker matched above, prod marker set so the
  // hard-block is armed). A missing marker must NOT fail open here.
  if (process.env.NODE_ENV === 'production') {
    if (process.env.E2E_ALLOW_PRODUCTION_SERVER !== 'true') return false
    if (!requiredMarker) return false
    if (!prodMarker) return false
  }

  return true
}
