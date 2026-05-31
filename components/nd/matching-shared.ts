export const PSEUDONYM_COLORS = [
  {
    chip: 'bg-[var(--pseudonym-1-bg)] text-[var(--pseudonym-1-text)] border border-[var(--pseudonym-1-border)]',
    border: 'border-[var(--pseudonym-1-border)]',
  },
  {
    chip: 'bg-[var(--pseudonym-2-bg)] text-[var(--pseudonym-2-text)] border border-[var(--pseudonym-2-border)]',
    border: 'border-[var(--pseudonym-2-border)]',
  },
  {
    chip: 'bg-[var(--pseudonym-3-bg)] text-[var(--pseudonym-3-text)] border border-[var(--pseudonym-3-border)]',
    border: 'border-[var(--pseudonym-3-border)]',
  },
  {
    chip: 'bg-[var(--pseudonym-4-bg)] text-[var(--pseudonym-4-text)] border border-[var(--pseudonym-4-border)]',
    border: 'border-[var(--pseudonym-4-border)]',
  },
  {
    chip: 'bg-[var(--pseudonym-5-bg)] text-[var(--pseudonym-5-text)] border border-[var(--pseudonym-5-border)]',
    border: 'border-[var(--pseudonym-5-border)]',
  },
  {
    chip: 'bg-[var(--pseudonym-6-bg)] text-[var(--pseudonym-6-text)] border border-[var(--pseudonym-6-border)]',
    border: 'border-[var(--pseudonym-6-border)]',
  },
  {
    chip: 'bg-[var(--pseudonym-7-bg)] text-[var(--pseudonym-7-text)] border border-[var(--pseudonym-7-border)]',
    border: 'border-[var(--pseudonym-7-border)]',
  },
  {
    chip: 'bg-[var(--pseudonym-8-bg)] text-[var(--pseudonym-8-text)] border border-[var(--pseudonym-8-border)]',
    border: 'border-[var(--pseudonym-8-border)]',
  },
  {
    chip: 'bg-[var(--pseudonym-9-bg)] text-[var(--pseudonym-9-text)] border border-[var(--pseudonym-9-border)]',
    border: 'border-[var(--pseudonym-9-border)]',
  },
  {
    chip: 'bg-[var(--pseudonym-10-bg)] text-[var(--pseudonym-10-text)] border border-[var(--pseudonym-10-border)]',
    border: 'border-[var(--pseudonym-10-border)]',
  },
  {
    chip: 'bg-[var(--pseudonym-11-bg)] text-[var(--pseudonym-11-text)] border border-[var(--pseudonym-11-border)]',
    border: 'border-[var(--pseudonym-11-border)]',
  },
  {
    chip: 'bg-[var(--pseudonym-12-bg)] text-[var(--pseudonym-12-text)] border border-[var(--pseudonym-12-border)]',
    border: 'border-[var(--pseudonym-12-border)]',
  },
  {
    chip: 'bg-[var(--pseudonym-13-bg)] text-[var(--pseudonym-13-text)] border border-[var(--pseudonym-13-border)]',
    border: 'border-[var(--pseudonym-13-border)]',
  },
  {
    chip: 'bg-[var(--pseudonym-14-bg)] text-[var(--pseudonym-14-text)] border border-[var(--pseudonym-14-border)]',
    border: 'border-[var(--pseudonym-14-border)]',
  },
  {
    chip: 'bg-[var(--pseudonym-15-bg)] text-[var(--pseudonym-15-text)] border border-[var(--pseudonym-15-border)]',
    border: 'border-[var(--pseudonym-15-border)]',
  },
  {
    chip: 'bg-[var(--pseudonym-16-bg)] text-[var(--pseudonym-16-text)] border border-[var(--pseudonym-16-border)]',
    border: 'border-[var(--pseudonym-16-border)]',
  },
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
  if (rank <= 3) return 'очень хочу'
  return 'хочу'
}

export function rankTooltip(rank: number | null): string {
  return rank === null ? 'Ранг не задан' : `Ранг: #${rank}`
}

export function isStrongInterest(rank: number | null): boolean {
  return rank !== null && rank <= 3
}

export function parseRecommendationLink(raw: string): { text: string; url: string } | null {
  const idx = Math.max(raw.lastIndexOf('https://'), raw.lastIndexOf('http://'))
  if (idx === -1) return null
  const url = raw.slice(idx).trim()
  const text = raw.slice(0, idx).trim()
  if (!text) return null
  return { text, url }
}
