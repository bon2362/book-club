import { load } from 'cheerio'
import { collectWikipediaImageTitles, transformWikipediaHtml } from './transform'
import {
  WikipediaArticleError,
  type WikipediaArticleDocument,
  type WikipediaImageAttribution,
  type WikipediaTarget,
} from './types'

const USER_AGENT = 'SlowReadingClub/1.0 (https://www.slowreading.club)'
const MAX_UPSTREAM_BYTES = 1_500_000
const DEFAULT_TIMEOUT_MS = 8_000
const RETRY_DELAY_MS = 250
const MAX_RETRY_DELAY_MS = 1_000

interface FetchWikipediaOptions {
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

interface ArticleMetadata {
  canonicalTitle: string
  articleUrl: string
  revisionId: number
  revisionTimestamp: string
}

export async function fetchWikipediaArticle(
  target: WikipediaTarget,
  options: FetchWikipediaOptions = {},
): Promise<WikipediaArticleDocument> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS

  const meta = await fetchMetadata(target, fetchImpl, timeoutMs)
  const html = await fetchArticleHtml(target.language, meta.canonicalTitle, fetchImpl, timeoutMs)

  const imageTitles = collectWikipediaImageTitles(html)
  const imageAttributions = imageTitles.length
    ? await fetchImageAttributions(target.language, imageTitles, fetchImpl, timeoutMs)
    : new Map<string, WikipediaImageAttribution>()

  const nodes = transformWikipediaHtml({ html, articleUrl: meta.articleUrl, imageAttributions })

  return {
    language: target.language,
    title: meta.canonicalTitle,
    articleUrl: meta.articleUrl,
    historyUrl: `${meta.articleUrl}?action=history`,
    revisionId: meta.revisionId,
    revisionTimestamp: meta.revisionTimestamp,
    nodes,
  }
}

async function fetchMetadata(
  target: WikipediaTarget,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<ArticleMetadata> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    prop: 'info|revisions',
    inprop: 'url',
    rvprop: 'ids|timestamp',
    redirects: '1',
    titles: target.title,
  })
  const url = `https://${target.language}.wikipedia.org/w/api.php?${params.toString()}`
  const res = await fetchWithRetry(url, fetchImpl, timeoutMs, 'application/json')
  if (!res.ok) throw statusError(res.status)

  const data = (await res.json()) as {
    query?: { pages?: Array<Record<string, unknown>> }
  }
  const page = data.query?.pages?.[0]
  if (!page || page.missing || page.ns !== 0 || typeof page.pageid !== 'number') {
    throw new WikipediaArticleError('not_found', 'Статья не найдена')
  }

  const revision = Array.isArray(page.revisions) ? page.revisions[0] : undefined
  const fullurl = typeof page.fullurl === 'string' ? page.fullurl : null
  const canonicalTitle = typeof page.title === 'string' ? page.title : null
  if (!fullurl || !canonicalTitle || !revision || typeof revision.revid !== 'number') {
    throw new WikipediaArticleError('upstream_error', 'Некорректный ответ Wikipedia')
  }

  return {
    canonicalTitle,
    articleUrl: fullurl,
    revisionId: revision.revid,
    revisionTimestamp: String(revision.timestamp ?? ''),
  }
}

async function fetchArticleHtml(
  language: string,
  canonicalTitle: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<string> {
  const url = `https://${language}.wikipedia.org/w/rest.php/v1/page/${encodeURIComponent(canonicalTitle)}/html`
  const res = await fetchWithRetry(url, fetchImpl, timeoutMs, 'text/html')
  if (!res.ok) throw statusError(res.status)

  const declaredLength = Number(res.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPSTREAM_BYTES) {
    throw new WikipediaArticleError('article_too_large', 'Статья слишком большая')
  }

  const html = await res.text()
  if (Buffer.byteLength(html, 'utf8') > MAX_UPSTREAM_BYTES) {
    throw new WikipediaArticleError('article_too_large', 'Статья слишком большая')
  }
  return html
}

async function fetchImageAttributions(
  language: string,
  titles: string[],
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Map<string, WikipediaImageAttribution>> {
  const map = new Map<string, WikipediaImageAttribution>()
  try {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      titles: titles.join('|'),
    })
    const url = `https://${language}.wikipedia.org/w/api.php?${params.toString()}`
    const res = await fetchWithRetry(url, fetchImpl, timeoutMs, 'application/json')
    if (!res.ok) return map

    const data = (await res.json()) as {
      query?: { pages?: Array<Record<string, unknown>> }
    }
    for (const page of data.query?.pages ?? []) {
      const title = typeof page.title === 'string' ? page.title : null
      const info = Array.isArray(page.imageinfo) ? page.imageinfo[0] : undefined
      if (!title || !info) continue

      const ext = (info.extmetadata ?? {}) as Record<string, { value?: string } | undefined>
      const artist = stripHtml(ext.Artist?.value)
      const licenseName = stripHtml(ext.LicenseShortName?.value)
      const licenseUrl = (ext.LicenseUrl?.value ?? '').trim()
      const descriptionUrl = typeof info.descriptionurl === 'string' ? info.descriptionurl.trim() : ''

      if (artist && licenseName && licenseUrl && descriptionUrl) {
        map.set(title, { artist, licenseName, licenseUrl, descriptionUrl })
      }
    }
  } catch {
    // Image attribution is best-effort: a failure simply omits images.
    return map
  }
  return map
}

async function fetchWithRetry(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  accept: string,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    let res: Response
    try {
      res = await fetchImpl(url, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT, Accept: accept },
      })
    } catch (error) {
      clearTimeout(timer)
      if (isAbortError(error)) {
        throw new WikipediaArticleError('timeout', 'Превышено время ожидания Wikipedia')
      }
      throw new WikipediaArticleError('upstream_error', 'Сбой запроса к Wikipedia')
    }
    clearTimeout(timer)

    if (attempt === 0 && (res.status === 429 || res.status === 503)) {
      await delay(retryDelayMs(res))
      continue
    }
    return res
  }
}

function statusError(status: number): WikipediaArticleError {
  if (status === 404) return new WikipediaArticleError('not_found', 'Статья не найдена')
  if (status === 429) return new WikipediaArticleError('rate_limited', 'Слишком много запросов')
  return new WikipediaArticleError('upstream_error', `Сбой Wikipedia (${status})`)
}

function retryDelayMs(res: Response): number {
  const header = res.headers.get('retry-after')
  if (header && /^\d+$/.test(header.trim())) {
    return Math.min(Number(header.trim()) * 1000, MAX_RETRY_DELAY_MS)
  }
  return RETRY_DELAY_MS
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function stripHtml(value: string | undefined): string {
  if (!value) return ''
  return load(value).text().replace(/\s+/g, ' ').trim()
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
