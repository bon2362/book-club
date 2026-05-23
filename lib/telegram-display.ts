export interface TelegramDisplayUser {
  contacts?: string | null
}

function stripTelegramUrl(value: string): string {
  return value
    .replace(/^https?:\/\/(?:www\.)?t\.me\//i, '')
    .replace(/^t\.me\//i, '')
}

export function normalizeTelegramContact(rawContact: string | null | undefined): string | null {
  const trimmed = rawContact?.trim()
  if (!trimmed) return null

  const withoutUrl = stripTelegramUrl(trimmed).split(/[/?#]/)[0]
  const username = withoutUrl.replace(/^@/, '').trim()
  if (!/^[a-zA-Z0-9_]{1,32}$/.test(username)) return null
  return username
}

export function formatTelegramDisplay(user: TelegramDisplayUser): string {
  const username = normalizeTelegramContact(user.contacts)
  return username ? `@${username}` : ''
}
