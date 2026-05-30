export const PSEUDONYM_COLORS = Array(16).fill({
  chip: 'bg-transparent text-[#444] border border-[#d6d6d6]',
  border: 'border-[#d6d6d6]',
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
  if (rank <= 3) return 'хочу читать'
  return 'готов(а)'
}

export function parseRecommendationLink(raw: string): { text: string; url: string } | null {
  const idx = Math.max(raw.lastIndexOf('https://'), raw.lastIndexOf('http://'))
  if (idx === -1) return null
  const url = raw.slice(idx).trim()
  const text = raw.slice(0, idx).trim()
  if (!text) return null
  return { text, url }
}
