import * as cheerio from 'cheerio'

/** Минимальная форма узла разбора, достаточная для обхода. */
type HtmlNode = {
  type: string
  name?: string
  data?: string
  children?: HtmlNode[]
}

/**
 * Теги, встречающиеся в переносимых данных (редактор Tiptap выдаёт только их).
 * `br` добавлен на случай мягкого переноса внутри абзаца.
 */
const SUPPORTED_TAGS = new Set(['p', 'a', 'strong', 'ul', 'li', 'br'])

/**
 * Экранирует символы, которые markdown иначе примет за разметку.
 * `_` намеренно не экранируется: внутри слова он не создаёт выделения
 * (CommonMark), а ссылки в данных содержат его часто и экранирование
 * замусорило бы текст.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/([\\`*[\]])/g, '\\$1')
}

function assertSupported(tag: string): void {
  if (!SUPPORTED_TAGS.has(tag)) {
    throw new Error(`htmlToMarkdown: неподдерживаемый тег <${tag}>`)
  }
}

function renderInline($: cheerio.CheerioAPI, nodes: HtmlNode[]): string {
  return nodes
    .map((node) => {
      if (node.type === 'text') return escapeMarkdown(node.data ?? '')
      if (node.type !== 'tag') return ''

      const tag = (node.name ?? '').toLowerCase()
      assertSupported(tag)

      if (tag === 'br') return '\n'

      const inner = renderInline($, node.children ?? [])
      if (tag === 'strong') return `**${inner}**`
      if (tag === 'a') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const href = $(node as any).attr('href') ?? ''
        return `[${inner}](${href})`
      }
      return inner
    })
    .join('')
}

/**
 * Переводит HTML редактора Tiptap в markdown. Рассчитан на набор тегов,
 * встречающийся в переносимых данных; на любом другом теге падает, чтобы
 * потеря текста при разовом переносе не прошла незамеченной.
 */
export function htmlToMarkdown(html: string): string {
  if (html.trim() === '') return ''

  const $ = cheerio.load(html, null, false)
  const blocks: string[] = []

  $.root()
    .children()
    .each((_index, element) => {
      const node = element as unknown as HtmlNode
      const tag = (node.name ?? '').toLowerCase()
      assertSupported(tag)

      if (tag === 'ul') {
        const items = (node.children ?? [])
          .filter((child) => child.type === 'tag' && (child.name ?? '').toLowerCase() === 'li')
          .map((li) => `- ${renderInline($, li.children ?? []).trim()}`)
        blocks.push(items.join('\n'))
        return
      }

      blocks.push(renderInline($, node.children ?? []).trim())
    })

  return blocks.filter((block) => block !== '').join('\n\n')
}
