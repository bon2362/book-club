import { ImageResponse } from 'next/og'

export const runtime = 'nodejs'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          background: '#F5F0E8',
        }}
      >
        {/* Left panel */}
        <div
          style={{
            width: '1200px',
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
                color: 'var(--text-muted)',
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
                fontSize: '88px',
                lineHeight: 1.05,
                color: 'var(--text)',
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
                color: 'var(--text-secondary)',
                display: 'flex',
              }}
            >
              Записывайтесь на совместное чтение и обсуждение книг
            </div>
          </div>

          {/* Bottom: domain */}
          <div
            style={{
              fontFamily: 'serif',
              fontSize: '17px',
              color: 'var(--accent)',
              letterSpacing: '0.04em',
              display: 'flex',
            }}
          >
            slowreading.club
          </div>
        </div>
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
