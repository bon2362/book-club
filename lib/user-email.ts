const SYNTHETIC_TELEGRAM_EMAIL_RE = /^telegram:[^@]+@telegram\.user$/i

export function isSyntheticTelegramEmail(email?: string | null): boolean {
  return SYNTHETIC_TELEGRAM_EMAIL_RE.test(email?.trim() ?? '')
}

export function getContactEmail(email?: string | null): string | null {
  const normalized = email?.trim()
  if (!normalized || isSyntheticTelegramEmail(normalized)) return null
  return normalized
}
