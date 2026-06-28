const READING_WORDS_PER_MINUTE = 150

export function slugifyAuthor(displayName: string): string {
  const base = displayName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'author'
}

export function buildAuthorSlugs(summaries: { displayName: string }[]): string[] {
  const seen = new Map<string, number>()
  return summaries.map(summary => {
    const base = slugifyAuthor(summary.displayName)
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base}-${count}`
  })
}

export function estimateReadingMinutes(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(words / READING_WORDS_PER_MINUTE))
}

export function selectSummaryIndex(slugs: string[], param: string | undefined): number {
  if (!param) return 0
  const index = slugs.indexOf(param)
  return index === -1 ? 0 : index
}
