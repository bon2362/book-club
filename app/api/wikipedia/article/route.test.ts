/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'

jest.mock('@/lib/wikipedia/url', () => ({
  WikipediaUrlError: class WikipediaUrlError extends Error {},
  parseWikipediaUrl: jest.fn(),
}))
jest.mock('@/lib/wikipedia/fetch', () => ({
  fetchWikipediaArticle: jest.fn(),
}))

import { WikipediaUrlError, parseWikipediaUrl } from '@/lib/wikipedia/url'
import { fetchWikipediaArticle } from '@/lib/wikipedia/fetch'
import { WikipediaArticleError } from '@/lib/wikipedia/types'
import { GET } from './route'

const target = { language: 'en', title: 'Socialism', articleUrl: 'https://en.wikipedia.org/wiki/Socialism' }
const article = {
  language: 'en',
  title: 'Socialism',
  articleUrl: target.articleUrl,
  historyUrl: `${target.articleUrl}?action=history`,
  revisionId: 1,
  revisionTimestamp: '2026-01-01T00:00:00Z',
  nodes: [],
}

function request(url: string | null): NextRequest {
  const search = url === null ? '' : `?url=${encodeURIComponent(url)}`
  return new NextRequest(`http://localhost/api/wikipedia/article${search}`)
}

describe('GET /api/wikipedia/article', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns 400 invalid_url when the url is missing', async () => {
    const res = await GET(request(null))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_url' })
  })

  it('returns 400 invalid_url when parsing rejects', async () => {
    ;(parseWikipediaUrl as jest.Mock).mockImplementation(() => {
      throw new WikipediaUrlError()
    })
    const res = await GET(request('https://example.com'))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'invalid_url' })
  })

  it('returns the article with the public cache header', async () => {
    ;(parseWikipediaUrl as jest.Mock).mockReturnValue(target)
    ;(fetchWikipediaArticle as jest.Mock).mockResolvedValue(article)

    const res = await GET(request(target.articleUrl))

    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe(
      'public, s-maxage=3600, stale-while-revalidate=86400',
    )
    expect(await res.json()).toEqual(article)
  })

  it.each([
    ['invalid_url', 400],
    ['not_found', 404],
    ['rate_limited', 503],
    ['timeout', 504],
    ['article_too_large', 413],
    ['upstream_error', 502],
  ] as const)('maps %s error to status %s', async (code, status) => {
    ;(parseWikipediaUrl as jest.Mock).mockReturnValue(target)
    ;(fetchWikipediaArticle as jest.Mock).mockRejectedValue(new WikipediaArticleError(code, 'x'))

    const res = await GET(request(target.articleUrl))
    expect(res.status).toBe(status)
    expect(await res.json()).toEqual({ error: code })
  })

  it('returns 502 upstream_error for unexpected failures', async () => {
    ;(parseWikipediaUrl as jest.Mock).mockReturnValue(target)
    ;(fetchWikipediaArticle as jest.Mock).mockRejectedValue(new Error('boom'))

    const res = await GET(request(target.articleUrl))
    expect(res.status).toBe(502)
    expect(await res.json()).toEqual({ error: 'upstream_error' })
  })
})
