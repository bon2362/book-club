import { ImageResponse } from 'next/og'
import { fetchBooks } from '@/lib/sheets'

export const runtime = 'nodejs'

const COVER_W = 168
const COVER_H = 235
const GAP = 10

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

export async function GET() {
  let coverUrls: string[] = []

  try {
    const books = await fetchBooks()
    const withCovers = books.filter(b => b.coverUrl)
    coverUrls = pickRandom(withCovers, 6).map(b => b.coverUrl!)
  } catch {
    // fall through to text-only
  }

  const hasCovers = coverUrls.length >= 3

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'row',
          background: '#F5F0E8',
        }}
      >
        {/* Left panel */}
        <div
          style={{
            width: hasCovers ? '680px' : '1200px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '72px 72px 60px 80px',
            borderLeft: '3px solid #C0603A',
            marginLeft: '48px',
          }}
        >
          {/* Top area: eyebrow + title + description */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div
              style={{
                fontFamily: 'serif',
                fontSize: '17px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: '#999',
                marginBottom: '22px',
                display: 'flex',
              }}
            >
              Читательские круги
            </div>

            <div
              style={{
                fontFamily: 'serif',
                fontWeight: 700,
                fontSize: hasCovers ? '74px' : '88px',
                lineHeight: 1.05,
                color: '#111',
                letterSpacing: '-0.02em',
                marginBottom: '28px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <span>Долгое</span>
              <span>наступление</span>
            </div>

            <div
              style={{
                fontFamily: 'serif',
                fontStyle: 'italic',
                fontSize: '22px',
                lineHeight: 1.5,
                color: '#555',
                display: 'flex',
              }}
            >
              Записывайтесь на совместное чтение
              {!hasCovers ? ' и обсуждение книг' : ''}
            </div>
          </div>

          {/* Bottom: domain */}
          <div
            style={{
              fontFamily: 'serif',
              fontSize: '17px',
              color: '#C0603A',
              letterSpacing: '0.04em',
              display: 'flex',
            }}
          >
            slowreading.club
          </div>
        </div>

        {/* Right panel: book covers */}
        {hasCovers && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '32px 32px 32px 24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                flexDirection: 'row',
                gap: `${GAP}px`,
              }}
            >
              {/* Column 1: covers 0, 2, 4 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: `${GAP}px` }}>
                {[0, 2, 4].map(i =>
                  coverUrls[i] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={coverUrls[i]}
                      alt=""
                      width={COVER_W}
                      height={COVER_H}
                      style={{
                        objectFit: 'cover',
                        borderRadius: '3px',
                        boxShadow: '0 3px 12px rgba(0,0,0,0.2)',
                      }}
                    />
                  ) : null
                )}
              </div>
              {/* Column 2: covers 1, 3, 5 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: `${GAP}px` }}>
                {[1, 3, 5].map(i =>
                  coverUrls[i] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={coverUrls[i]}
                      alt=""
                      width={COVER_W}
                      height={COVER_H}
                      style={{
                        objectFit: 'cover',
                        borderRadius: '3px',
                        boxShadow: '0 3px 12px rgba(0,0,0,0.2)',
                      }}
                    />
                  ) : null
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: {
        'Cache-Control': 'public, max-age=21600, s-maxage=21600',
      },
    }
  )
}
