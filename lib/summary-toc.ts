export interface TocHeading {
  id: string
  text: string
}

export function slugify(text: string): string {
  const base = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9а-яё]+/gi, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'section'
}

function cleanInline(raw: string): string {
  return raw
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // ссылки/картинки → текст
    .replace(/[*_`~]/g, '') // маркеры эмфазы/кода
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Заголовки уровня ## в порядке документа, со стабильными slug-id (дедуп суффиксом).
 * ВАЖНО: id должны совпадать с id, которые SummaryMarkdown проставляет на <h2>.
 * Это достигается тем, что SummaryMarkdown берёт id из ЭТОГО же массива по
 * счётчику в порядке эмита (см. Task 2), а не слугифицирует независимо.
 * Fenced-code вырезаем, т.к. react-markdown не рендерит "## ..." внутри кода как h2.
 */
export function extractH2Headings(markdown: string): TocHeading[] {
  const withoutCode = markdown.replace(/```[\s\S]*?```/g, '')
  const re = /^##[ \t]+(.+?)[ \t]*#*[ \t]*$/gm
  const seen = new Map<string, number>()
  const headings: TocHeading[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(withoutCode)) !== null) {
    const text = cleanInline(match[1])
    if (!text) continue
    const base = slugify(text)
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    headings.push({ id: count === 1 ? base : `${base}-${count}`, text })
  }
  return headings
}
