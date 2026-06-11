export const PSEUDONYM_COLORS = Array(16).fill({
  chip: 'bg-[var(--bg-tag)] text-[var(--text-secondary)] border border-[var(--border)]',
  border: 'border-[var(--border)]',
})

export function getPseudonymColor(pseudonym: string) {
  let hash = 0
  for (let i = 0; i < pseudonym.length; i++) hash = pseudonym.charCodeAt(i) + ((hash << 5) - hash)
  return PSEUDONYM_COLORS[Math.abs(hash) % PSEUDONYM_COLORS.length]
}

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
 * Для админа возвращает «Псевдоним (Имя)» если карта есть и имя не пустое.
 * Для обычного пользователя (map=null) — возвращает чистый псевдоним.
 */
export function withAdminName(
  pseudonym: string,
  adminNamesByPseudonym: Map<string, string | null> | null | undefined,
): string {
  if (!adminNamesByPseudonym) return pseudonym
  const name = adminNamesByPseudonym.get(pseudonym)
  if (!name) return pseudonym
  return `${pseudonym} (${name})`
}

export function parseRecommendationLink(raw: string): { text: string; url: string } | null {
  const idx = Math.max(raw.lastIndexOf('https://'), raw.lastIndexOf('http://'))
  if (idx === -1) return null
  const url = raw.slice(idx).trim()
  const text = raw.slice(0, idx).trim()
  if (!text) return null
  return { text, url }
}
