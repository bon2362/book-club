import { ImageResponse } from 'next/og'
import { NextRequest, NextResponse } from 'next/server'
import { loadCollectionPageData } from '@/lib/collections/repo'
import { textsCount } from '@/lib/collections/format'
import { OG_COLORS, authorInitials, fetchCoverDataUrl } from '@/lib/collections/og'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const COVER_WIDTH = 140
const COVER_HEIGHT = 210
const COVER_OVERLAP = 44

export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const data = await loadCollectionPageData(params.slug, { userId: null, isAdmin: false }).catch(() => null)
  // Неопубликованная или несуществующая подборка — общая картинка сайта.
  if (!data || data.record.slug !== params.slug) {
    return NextResponse.redirect(new URL('/api/og', req.url))
  }

  const covers = await Promise.all(
    data.books.slice(0, 5).map(async ({ book }) => ({
      id: book.id,
      author: book.author,
      src: await fetchCoverDataUrl(book.coverUrl),
    })),
  )

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          background: OG_COLORS.bg,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', maxWidth: '1000px' }}>
          <div
            style={{
              display: 'flex',
              marginBottom: '22px',
              fontFamily: 'serif',
              fontSize: '20px',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: OG_COLORS.accent,
            }}
          >
            {`Подборка · ${textsCount(data.books.length)}`}
          </div>
          <div
            style={{
              display: 'flex',
              maxHeight: '210px',
              overflow: 'hidden',
              fontFamily: 'serif',
              fontWeight: 700,
              fontSize: '64px',
              lineHeight: 1.08,
              color: OG_COLORS.text,
            }}
          >
            {data.record.title}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', height: `${COVER_HEIGHT}px` }}>
            {covers.map((cover, index) => (
              <div
                key={cover.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: `${COVER_WIDTH}px`,
                  height: `${COVER_HEIGHT}px`,
                  marginLeft: index === 0 ? '0' : `-${COVER_OVERLAP}px`,
                  overflow: 'hidden',
                  background: OG_COLORS.coverFallback,
                  borderRight: `2px solid ${OG_COLORS.border}`,
                }}
              >
                {cover.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover.src} width={COVER_WIDTH} height={COVER_HEIGHT} style={{ objectFit: 'cover' }} alt="" />
                ) : (
                  <div style={{ display: 'flex', fontFamily: 'serif', fontWeight: 700, fontSize: '40px', color: OG_COLORS.muted }}>
                    {authorInitials(cover.author)}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', fontFamily: 'serif', fontSize: '26px', color: OG_COLORS.muted }}>
            Долгое наступление
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' } },
  )
}
