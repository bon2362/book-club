import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'flex-start',
          background: '#F5F0E8',
          padding: '80px 100px',
          position: 'relative',
        }}
      >
        {/* Decorative vertical line */}
        <div
          style={{
            position: 'absolute',
            left: '60px',
            top: '80px',
            bottom: '80px',
            width: '3px',
            background: '#C0603A',
          }}
        />

        {/* Eyebrow */}
        <div
          style={{
            fontFamily: 'serif',
            fontSize: '18px',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#999',
            marginBottom: '24px',
          }}
        >
          Читательские круги
        </div>

        {/* Title */}
        <div
          style={{
            fontFamily: 'serif',
            fontWeight: 700,
            fontSize: '88px',
            lineHeight: 1.1,
            color: '#111',
            letterSpacing: '-0.02em',
            marginBottom: '32px',
          }}
        >
          Долгое
          <br />
          наступление
        </div>

        {/* Description */}
        <div
          style={{
            fontFamily: 'serif',
            fontStyle: 'italic',
            fontSize: '26px',
            lineHeight: 1.5,
            color: '#555',
            maxWidth: '700px',
          }}
        >
          Записывайтесь на совместное чтение и обсуждение книг
        </div>

        {/* Bottom domain */}
        <div
          style={{
            position: 'absolute',
            bottom: '56px',
            right: '100px',
            fontFamily: 'serif',
            fontSize: '18px',
            color: '#C0603A',
            letterSpacing: '0.04em',
          }}
        >
          slowreading.club
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  )
}
