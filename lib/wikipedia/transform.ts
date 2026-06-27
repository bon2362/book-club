import { load } from 'cheerio'
import type { Cheerio, CheerioAPI } from 'cheerio'
import type { AnyNode, Element } from 'domhandler'
import type {
  WikipediaArticleNode,
  WikipediaImageAttribution,
  WikipediaInlineNode,
} from './types'

export interface TransformWikipediaHtmlInput {
  html: string
  articleUrl: string
  imageAttributions: Map<string, WikipediaImageAttribution>
}

const REMOVE_SELECTOR = [
  'script',
  'style',
  'iframe',
  'form',
  'table',
  '.infobox',
  '.navbox',
  '.vertical-navbox',
  '.hatnote',
  '.ambox',
  '.mw-editsection',
  '.toc',
  '.references',
  '.reflist',
  'sup.reference',
  '[hidden]',
].join(', ')

const CONTAINER_TAGS = new Set(['body', 'section', 'div'])
const MAX_IMAGE_TITLES = 8

export function collectWikipediaImageTitles(html: string, limit = MAX_IMAGE_TITLES): string[] {
  const $ = load(html)
  const titles: string[] = []
  const seen = new Set<string>()

  $('[resource], a[href]').each((_, el) => {
    const raw = $(el).attr('resource') ?? $(el).attr('href')
    const title = fileTitleFrom(raw)
    if (title && !seen.has(title)) {
      seen.add(title)
      titles.push(title)
    }
  })

  return titles.slice(0, limit)
}

export function transformWikipediaHtml(
  input: TransformWikipediaHtmlInput,
): WikipediaArticleNode[] {
  const { html, articleUrl, imageAttributions } = input
  const $ = load(html)
  $(REMOVE_SELECTOR).remove()

  const nodes: WikipediaArticleNode[] = []
  const body = $('body').length ? $('body') : $.root()
  walkContainer($, body, articleUrl, imageAttributions, nodes)
  return nodes
}

function walkContainer(
  $: CheerioAPI,
  container: Cheerio<AnyNode>,
  articleUrl: string,
  attributions: Map<string, WikipediaImageAttribution>,
  out: WikipediaArticleNode[],
): void {
  container.children().each((_, child) => {
    if (child.type !== 'tag') return
    const tag = child.tagName.toLowerCase()

    if (CONTAINER_TAGS.has(tag)) {
      walkContainer($, $(child), articleUrl, attributions, out)
      return
    }

    const node = mapBlock($, child, tag, articleUrl, attributions)
    if (node) out.push(node)
  })
}

function mapBlock(
  $: CheerioAPI,
  el: Element,
  tag: string,
  articleUrl: string,
  attributions: Map<string, WikipediaImageAttribution>,
): WikipediaArticleNode | null {
  switch (tag) {
    case 'h2':
    case 'h3':
    case 'h4': {
      const children = inlineChildren($, el, articleUrl)
      if (!children.length) return null
      return { type: 'heading', level: Number(tag[1]) as 2 | 3 | 4, children }
    }
    case 'p': {
      const children = inlineChildren($, el, articleUrl)
      if (!children.length) return null
      return { type: 'paragraph', children }
    }
    case 'ul':
    case 'ol': {
      const items: WikipediaInlineNode[][] = []
      $(el)
        .children('li')
        .each((_, li) => {
          const inline = inlineChildren($, li, articleUrl)
          if (inline.length) items.push(inline)
        })
      if (!items.length) return null
      return { type: 'list', ordered: tag === 'ol', items }
    }
    case 'blockquote': {
      const children = inlineChildren($, el, articleUrl)
      if (!children.length) return null
      return { type: 'quote', children }
    }
    case 'figure':
      return mapFigure($, el, articleUrl, attributions)
    default:
      return null
  }
}

function mapFigure(
  $: CheerioAPI,
  el: Element,
  articleUrl: string,
  attributions: Map<string, WikipediaImageAttribution>,
): WikipediaArticleNode | null {
  const img = $(el).find('img').first()
  if (!img.length) return null

  const title =
    fileTitleFrom(img.attr('resource')) ??
    fileTitleFrom($(el).find('a[href]').first().attr('href'))
  if (!title) return null

  const attribution = attributions.get(title)
  if (!attribution) return null

  const src = normalizeImageSrc(img.attr('src'))
  if (!src) return null

  const caption = inlineChildren($, $(el).find('figcaption').get(0), articleUrl)
  return {
    type: 'image',
    src,
    alt: (img.attr('alt') ?? '').trim(),
    caption,
    attribution,
  }
}

function inlineChildren(
  $: CheerioAPI,
  el: Element | undefined,
  articleUrl: string,
): WikipediaInlineNode[] {
  if (!el) return []
  const nodes: WikipediaInlineNode[] = []
  for (const child of el.children) {
    collectInline($, child, articleUrl, nodes)
  }
  return normalizeInline(nodes)
}

function collectInline(
  $: CheerioAPI,
  node: AnyNode,
  articleUrl: string,
  out: WikipediaInlineNode[],
): void {
  if (node.type === 'text') {
    out.push({ type: 'text', value: node.data })
    return
  }
  if (node.type !== 'tag') return

  const tag = node.tagName.toLowerCase()
  const children: WikipediaInlineNode[] = []
  for (const child of node.children) collectInline($, child, articleUrl, children)

  if (tag === 'strong' || tag === 'b') {
    out.push({ type: 'strong', children })
  } else if (tag === 'em' || tag === 'i') {
    out.push({ type: 'emphasis', children })
  } else if (tag === 'a') {
    const href = resolveLink(node.attribs.href, articleUrl)
    if (href) {
      out.push({ type: 'link', href, children })
    } else {
      out.push(...children)
    }
  } else {
    // Unknown inline wrappers flatten to their safe children.
    out.push(...children)
  }
}

function normalizeInline(nodes: WikipediaInlineNode[]): WikipediaInlineNode[] {
  const collapsed: WikipediaInlineNode[] = []
  for (const node of nodes) {
    if (node.type === 'text') {
      const value = node.value.replace(/\s+/g, ' ')
      if (value) collapsed.push({ type: 'text', value })
    } else if (node.type === 'strong' || node.type === 'emphasis' || node.type === 'link') {
      const children = normalizeInline(node.children)
      if (children.length) collapsed.push({ ...node, children })
    }
  }
  if (collapsed.length) {
    trimEdge(collapsed[0], 'start')
    trimEdge(collapsed[collapsed.length - 1], 'end')
  }
  return collapsed.filter(node => node.type !== 'text' || node.value !== '')
}

function trimEdge(node: WikipediaInlineNode, side: 'start' | 'end'): void {
  if (node.type !== 'text') return
  node.value = side === 'start' ? node.value.replace(/^\s+/, '') : node.value.replace(/\s+$/, '')
}

function resolveLink(href: string | undefined, articleUrl: string): string | null {
  if (!href) return null
  try {
    const resolved = new URL(href, articleUrl)
    return resolved.protocol === 'https:' ? resolved.href : null
  } catch {
    return null
  }
}

function normalizeImageSrc(src: string | undefined): string | null {
  if (!src) return null
  const candidate = src.startsWith('//') ? `https:${src}` : src
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return null
  }
  if (url.protocol !== 'https:') return null
  const host = url.hostname.toLowerCase()
  if (host !== 'upload.wikimedia.org' && !host.endsWith('.wikimedia.org')) return null
  return url.href
}

function fileTitleFrom(raw: string | undefined): string | null {
  if (!raw) return null
  const marker = raw.indexOf('File:')
  if (marker === -1) return null
  let tail = raw.slice(marker)
  const stop = tail.search(/[?#]/)
  if (stop !== -1) tail = tail.slice(0, stop)
  try {
    return decodeURIComponent(tail).replace(/_/g, ' ').trim() || null
  } catch {
    return tail.replace(/_/g, ' ').trim() || null
  }
}
