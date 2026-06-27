import { fetchWikipediaArticle } from './fetch'
import { parseWikipediaUrl } from './url'

const target = parseWikipediaUrl('https://en.wikipedia.org/wiki/Socialism')

const metaBody = {
  query: {
    redirects: [{ from: 'socialism', to: 'Socialism' }],
    pages: [
      {
        pageid: 1,
        ns: 0,
        title: 'Socialism',
        fullurl: 'https://en.wikipedia.org/wiki/Socialism',
        revisions: [{ revid: 999, timestamp: '2026-01-01T00:00:00Z' }],
      },
    ],
  },
}

const articleHtml = `
  <html><body><section>
    <h2>History</h2>
    <p>First paragraph.</p>
    <figure typeof="mw:File/Thumb">
      <a href="./File:Attributed.jpg"><img resource="./File:Attributed.jpg" src="//upload.wikimedia.org/attributed.jpg" alt="Attributed"></a>
      <figcaption>Caption</figcaption>
    </figure>
  </section></body></html>`

const imageBody = {
  query: {
    pages: [
      {
        title: 'File:Attributed.jpg',
        imageinfo: [
          {
            url: 'https://upload.wikimedia.org/attributed.jpg',
            descriptionurl: 'https://commons.wikimedia.org/wiki/File:Attributed.jpg',
            extmetadata: {
              Artist: { value: '<a href="https://x">Example Author</a>' },
              LicenseShortName: { value: 'CC BY-SA 4.0' },
              LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
            },
          },
        ],
      },
    ],
  },
}

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  const status = init.status ?? 200
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(init.headers ?? {}),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response
}

function htmlResponse(html: string, init: { status?: number; headers?: Record<string, string> } = {}) {
  const status = init.status ?? 200
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'text/html', ...(init.headers ?? {}) }),
    text: async () => html,
    json: async () => {
      throw new Error('not json')
    },
  } as unknown as Response
}

describe('fetchWikipediaArticle', () => {
  it('returns a normalized document with attribution', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(metaBody))
      .mockResolvedValueOnce(htmlResponse(articleHtml))
      .mockResolvedValueOnce(jsonResponse(imageBody))

    const doc = await fetchWikipediaArticle(target, { fetchImpl, timeoutMs: 100 })

    expect(doc.title).toBe('Socialism')
    expect(doc.revisionId).toBe(999)
    expect(doc.revisionTimestamp).toBe('2026-01-01T00:00:00Z')
    expect(doc.articleUrl).toBe('https://en.wikipedia.org/wiki/Socialism')
    expect(doc.historyUrl).toBe('https://en.wikipedia.org/wiki/Socialism?action=history')
    expect(doc.nodes.map(n => n.type)).toEqual(['heading', 'paragraph', 'image'])

    const image = doc.nodes.find(n => n.type === 'image')
    expect(image).toMatchObject({
      attribution: { artist: 'Example Author', licenseName: 'CC BY-SA 4.0' },
    })

    const restCall = fetchImpl.mock.calls.find(c => String(c[0]).includes('/rest.php/'))
    expect(String(restCall![0])).toContain('Socialism')
    expect(restCall![1].headers['User-Agent']).toContain('SlowReadingClub')

    const imageCall = fetchImpl.mock.calls.find(c => String(c[0]).includes('imageinfo'))
    expect(decodeURIComponent(String(imageCall![0]))).toContain('File:Attributed.jpg')

    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })

  it('still returns the article when image metadata fails', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(metaBody))
      .mockResolvedValueOnce(htmlResponse(articleHtml))
      .mockResolvedValue(jsonResponse({}, { status: 500 }))

    const doc = await fetchWikipediaArticle(target, { fetchImpl, timeoutMs: 100 })
    expect(doc.nodes.map(n => n.type)).toEqual(['heading', 'paragraph'])
  })

  it('maps a missing page to not_found', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ query: { pages: [{ ns: 0, title: 'Nope', missing: true }] } }))

    await expect(fetchWikipediaArticle(target, { fetchImpl })).rejects.toMatchObject({ code: 'not_found' })
  })

  it('retries once on 429 and maps to rate_limited', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({}, { status: 429, headers: { 'retry-after': '0' } }))

    await expect(fetchWikipediaArticle(target, { fetchImpl })).rejects.toMatchObject({ code: 'rate_limited' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('retries once on 503 and maps to upstream_error', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({}, { status: 503, headers: { 'retry-after': '0' } }))

    await expect(fetchWikipediaArticle(target, { fetchImpl })).rejects.toMatchObject({ code: 'upstream_error' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('does not retry other failures', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(jsonResponse({}, { status: 500 }))

    await expect(fetchWikipediaArticle(target, { fetchImpl })).rejects.toMatchObject({ code: 'upstream_error' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('maps an abort to timeout without retry', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }))

    await expect(fetchWikipediaArticle(target, { fetchImpl })).rejects.toMatchObject({ code: 'timeout' })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('rejects an oversized content-length before reading', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(metaBody))
      .mockResolvedValueOnce(htmlResponse('x', { headers: { 'content-length': String(2_000_000) } }))

    await expect(fetchWikipediaArticle(target, { fetchImpl, timeoutMs: 100 })).rejects.toMatchObject({
      code: 'article_too_large',
    })
  })

  it('rejects an oversized body after reading', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse(metaBody))
      .mockResolvedValueOnce(htmlResponse('a'.repeat(1_500_001)))

    await expect(fetchWikipediaArticle(target, { fetchImpl, timeoutMs: 100 })).rejects.toMatchObject({
      code: 'article_too_large',
    })
  })
})
