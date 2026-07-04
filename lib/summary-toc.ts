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
 * Создаёт функцию слугификации с дедуп-счётчиком, общим на всё время жизни
 * слаггера: первое вхождение текста → slugify(text), повторные → `${base}-2`,
 * `${base}-3`, ... Используется и в extractH2Headings (TOC), и в
 * SummaryMarkdown (реальные id на <h2>) — единая логика дедупа в одном месте.
 */
export function createSlugger(): (text: string) => string {
  const seen = new Map<string, number>()
  return (text: string) => {
    const base = slugify(text)
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base}-${count}`
  }
}

/**
 * Заголовки уровня ## в порядке документа, со стабильными slug-id (дедуп суффиксом).
 * ВАЖНО: id здесь и id, которые SummaryMarkdown проставляет на <h2>, оба
 * выводятся из ТЕКСТА заголовка через createSlugger() — самодостаточно,
 * без индексации по счётчику эмита (что ломалось на вложенных <h2> внутри
 * blockquote/<details>, см. FIX 1 в code review).
 * Fenced-code, <details>-блоки и blockquote-строки вырезаем перед матчингом:
 * react-markdown рендерит "## ..." внутри них как настоящие <h2>, но такие
 * заголовки нельзя надёжно проскроллить (они в спойлере/цитате), поэтому
 * в оглавление они не попадают.
 *
 * Остаточное ограничение: если текст заголовка верхнего уровня совпадает с
 * текстом заголовка, вложенного в blockquote/<details>, суффикс дедупа в DOM
 * (там оба реально существуют как <h2>) может отличаться от суффикса в этом
 * TOC-списке (тут вложенный отфильтрован раньше). Патологический случай, принято.
 */
export function extractH2Headings(markdown: string): TocHeading[] {
  const withoutDetails = markdown.replace(/<details[\s\S]*?<\/details>/gi, '')
  const withoutCode = withoutDetails.replace(/```[\s\S]*?```/g, '')
  const withoutBlockquotes = withoutCode
    .split('\n')
    .filter(line => !/^[ \t]*>/.test(line))
    .join('\n')
  const re = /^##[ \t]+(.+?)[ \t]*#*[ \t]*$/gm
  const slug = createSlugger()
  const headings: TocHeading[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(withoutBlockquotes)) !== null) {
    const text = cleanInline(match[1])
    if (!text) continue
    headings.push({ id: slug(text), text })
  }
  return headings
}
