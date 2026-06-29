export function personalStatusLabel(personalStatus: string | null): string {
  if (personalStatus === 'reading') return 'Читаю сейчас'
  if (personalStatus === 'read') return 'Прочитал:а'
  return 'Записал:ась'
}

export function interestLabel(rank: number | null, personalStatus: string | null): string {
  if (personalStatus) return personalStatusLabel(personalStatus)
  if (rank === null) return 'без ранга'
  if (rank <= 3) return 'очень хочу'
  return 'хочу'
}

export function rankTooltip(rank: number | null): string {
  return rank === null ? 'приоритет не задан' : `книга на ${rank} месте`
}

export function isStrongInterest(rank: number | null): boolean {
  return rank !== null && rank <= 3
}

/**
 * Дополняет отображаемое имя административной подписью, если она передана.
 */
export function withAdminName(
  displayName: string,
  adminNamesByDisplayName: Map<string, string | null> | null | undefined,
): string {
  if (!adminNamesByDisplayName) return displayName
  const name = adminNamesByDisplayName.get(displayName)
  if (!name) return displayName
  return `${displayName} (${name})`
}

export function parseRecommendationLink(raw: string): { text: string; url: string } | null {
  const idx = Math.max(raw.lastIndexOf('https://'), raw.lastIndexOf('http://'))
  if (idx === -1) return null
  const url = raw.slice(idx).trim()
  const text = raw.slice(0, idx).trim()
  if (!text) return null
  return { text, url }
}
