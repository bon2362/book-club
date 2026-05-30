export const PSEUDONYM_COLORS = [
  { chip: 'bg-[#fde8d8] text-[#7c3516]', border: 'border-[#f8c4a0]' },
  { chip: 'bg-[#dcfce7] text-[#14532d]', border: 'border-[#86efac]' },
  { chip: 'bg-[#dbeafe] text-[#1e3a8a]', border: 'border-[#93c5fd]' },
  { chip: 'bg-[#fef9c3] text-[#713f12]', border: 'border-[#fde047]' },
  { chip: 'bg-[#f3e8ff] text-[#581c87]', border: 'border-[#d8b4fe]' },
  { chip: 'bg-[#ffe4e6] text-[#881337]', border: 'border-[#fda4af]' },
  { chip: 'bg-[#d1fae5] text-[#065f46]', border: 'border-[#6ee7b7]' },
  { chip: 'bg-[#e0f2fe] text-[#075985]', border: 'border-[#7dd3fc]' },
  { chip: 'bg-[#fce7f3] text-[#831843]', border: 'border-[#f9a8d4]' },
  { chip: 'bg-[#ccfbf1] text-[#134e4a]', border: 'border-[#5eead4]' },
  { chip: 'bg-[#ffedd5] text-[#7c2d12]', border: 'border-[#fdba74]' },
  { chip: 'bg-[#e0e7ff] text-[#3730a3]', border: 'border-[#a5b4fc]' },
  { chip: 'bg-[#ecfccb] text-[#3f6212]', border: 'border-[#bef264]' },
  { chip: 'bg-[#fae8ff] text-[#701a75]', border: 'border-[#f0abfc]' },
  { chip: 'bg-[#cffafe] text-[#155e75]', border: 'border-[#67e8f9]' },
  { chip: 'bg-[#fee2e2] text-[#7f1d1d]', border: 'border-[#fca5a5]' },
]

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
