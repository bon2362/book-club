import type { WikipediaTarget } from './types'

const WIKIPEDIA_HOST = /^([a-z0-9]+(?:-[a-z0-9]+)*)(?:\.m)?\.wikipedia\.org$/i
const FORBIDDEN_TITLE_DELIMITERS = new Set(['[', ']', '{', '}', '|', '<', '>', '#'])

export class WikipediaUrlError extends Error {
  constructor(message = 'Некорректная ссылка на статью Wikipedia') {
    super(message)
    this.name = 'WikipediaUrlError'
  }
}

function decodeQueryComponent(value: string): string {
  return decodeURIComponent(value.replaceAll('+', ' '))
}

function getValidatedQueryTitle(url: URL): string | null {
  for (const parameter of url.search.slice(1).split('&')) {
    const separatorIndex = parameter.indexOf('=')
    const rawName = separatorIndex === -1 ? parameter : parameter.slice(0, separatorIndex)
    const rawValue = separatorIndex === -1 ? '' : parameter.slice(separatorIndex + 1)

    let name: string
    try {
      name = decodeQueryComponent(rawName)
    } catch {
      continue
    }
    if (name !== 'title') continue

    try {
      decodeQueryComponent(rawValue)
    } catch {
      throw new WikipediaUrlError()
    }
    return url.searchParams.get('title')
  }

  return null
}

function hasForbiddenTitleCharacter(title: string): boolean {
  for (const character of title) {
    const codePoint = character.codePointAt(0)!
    if (codePoint <= 0x1f || codePoint === 0x7f || FORBIDDEN_TITLE_DELIMITERS.has(character)) {
      return true
    }
  }
  return false
}

export function parseWikipediaUrl(input: string): WikipediaTarget {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw new WikipediaUrlError()
  }

  if (url.protocol !== 'https:' || url.username || url.password || url.port) {
    throw new WikipediaUrlError()
  }

  const hostMatch = url.hostname.toLowerCase().match(WIKIPEDIA_HOST)
  const language = hostMatch?.[1]
  if (!language || language === 'www') throw new WikipediaUrlError()

  const pathTitle = url.pathname.startsWith('/wiki/') ? url.pathname.slice('/wiki/'.length) : null
  const queryTitle = url.pathname === '/w/index.php' ? getValidatedQueryTitle(url) : null
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

  if (!title || hasForbiddenTitleCharacter(title)) throw new WikipediaUrlError()

  const articleSlug = encodeURIComponent(title.replaceAll(' ', '_'))
  return {
    language,
    title,
    articleUrl: `https://${language}.wikipedia.org/wiki/${articleSlug}`,
  }
}
