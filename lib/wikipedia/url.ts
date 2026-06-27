import type { WikipediaTarget } from './types'

const WIKIPEDIA_HOST = /^([a-z0-9-]+)(?:\.m)?\.wikipedia\.org$/i

export class WikipediaUrlError extends Error {
  constructor(message = 'Некорректная ссылка на статью Wikipedia') {
    super(message)
    this.name = 'WikipediaUrlError'
  }
}

export function parseWikipediaUrl(input: string): WikipediaTarget {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new WikipediaUrlError()
  }

  if (url.protocol !== 'https:') throw new WikipediaUrlError()

  const hostMatch = url.hostname.toLowerCase().match(WIKIPEDIA_HOST)
  const language = hostMatch?.[1]
  if (!language || language === 'www') throw new WikipediaUrlError()

  const pathTitle = url.pathname.startsWith('/wiki/') ? url.pathname.slice('/wiki/'.length) : null
  const queryTitle = url.pathname === '/w/index.php' ? url.searchParams.get('title') : null
  if (!pathTitle && !queryTitle) throw new WikipediaUrlError()

  let title: string
  try {
    // URLSearchParams already decodes query values; pathname values still need decoding.
    title = (pathTitle ? decodeURIComponent(pathTitle) : queryTitle!)
      .replaceAll('_', ' ')
      .trim()
  } catch {
    throw new WikipediaUrlError()
  }

  if (!title || title.includes('\0')) throw new WikipediaUrlError()

  const articleSlug = encodeURIComponent(title.replaceAll(' ', '_'))
  return {
    language,
    title,
    articleUrl: `https://${language}.wikipedia.org/wiki/${articleSlug}`,
  }
}
