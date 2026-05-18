export function isTestEndpointAllowed() {
  return process.env.NODE_ENV !== 'production' && process.env.NEXTAUTH_TEST_MODE === 'true'
}
