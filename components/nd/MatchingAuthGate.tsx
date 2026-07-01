'use client'

import { useRouter } from 'next/navigation'
import AuthModal from './AuthModal'

const pageStyle: React.CSSProperties = {
  minHeight: '100svh',
  background: 'var(--bg)',
  color: 'var(--text)',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
  textAlign: 'center',
}

const microStyle: React.CSSProperties = {
  fontFamily: 'var(--nd-sans)',
  fontSize: '0.62rem',
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
  fontWeight: 600,
  color: 'var(--text-muted)',
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
}

export default function MatchingAuthGate() {
  const router = useRouter()

  return (
    <main style={pageStyle}>
      <div style={microStyle}>
        <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />
        Долгое наступление · читательский клуб
      </div>
      <h1
        style={{
          margin: '0.7rem 0 0',
          fontFamily: 'var(--nd-serif)',
          fontSize: 'clamp(1.35rem, 6vw, 1.7rem)',
          lineHeight: 1.12,
          fontWeight: 700,
          color: 'var(--text)',
        }}
      >
        Подбор пары
      </h1>
      <p style={{ margin: '0.55rem 0 0', fontFamily: 'var(--nd-serif)', fontSize: '0.95rem', lineHeight: 1.5, color: 'var(--text-body)' }}>
        Войдите, чтобы участвовать в подборе
      </p>
      <AuthModal isOpen onClose={() => router.push('/')} callbackUrl="/matching" />
    </main>
  )
}
