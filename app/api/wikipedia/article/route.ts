export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { fetchWikipediaArticle } from '@/lib/wikipedia/fetch'
import { parseWikipediaUrl } from '@/lib/wikipedia/url'
import { WikipediaArticleError, type WikipediaArticleErrorCode } from '@/lib/wikipedia/types'

const CACHE_CONTROL = 'public, s-maxage=3600, stale-while-revalidate=86400'

const STATUS_BY_CODE: Record<WikipediaArticleErrorCode, number> = {
  invalid_url: 400,
  not_found: 404,
  rate_limited: 503,
  timeout: 504,
  article_too_large: 413,
  upstream_error: 502,
}

function errorResponse(code: WikipediaArticleErrorCode): NextResponse {
  return NextResponse.json({ error: code }, { status: STATUS_BY_CODE[code] })
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = request.nextUrl.searchParams.get('url')
  if (!url) return errorResponse('invalid_url')

  let target
  try {
    target = parseWikipediaUrl(url)
  } catch {
    return errorResponse('invalid_url')
  }

  try {
    const article = await fetchWikipediaArticle(target)
    return NextResponse.json(article, { headers: { 'Cache-Control': CACHE_CONTROL } })
  } catch (error) {
    if (error instanceof WikipediaArticleError) {
      // Log only the safe code and language/title context, never the full URL or body.
      console.error('[wikipedia] article fetch failed', {
        code: error.code,
        language: target.language,
        title: target.title,
      })
      return errorResponse(error.code)
    }
    console.error('[wikipedia] unexpected article error', { language: target.language, title: target.title })
    return errorResponse('upstream_error')
  }
}
