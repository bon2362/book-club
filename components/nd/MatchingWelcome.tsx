'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import {
  getPseudonymIllustrationGlyph,
  getPseudonymIllustrationKind,
  getPseudonymPhoto,
} from '@/lib/matching/pseudonym-illustrations'

interface Props {
  sessionId: string
  sessionName: string
  pseudonym: string
}

const pageStyle: React.CSSProperties = {
  minHeight: '100svh',
  background: 'var(--bg)',
  color: 'var(--text)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '1rem',
}

const cardStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 432,
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderTop: '2px solid var(--text)',
  borderRadius: 'var(--radius)',
  boxShadow: 'var(--shadow-card)',
  padding: 'clamp(1.6rem, 5vw, 2.4rem)',
}

const microStyle: React.CSSProperties = {
  fontFamily: 'var(--nd-sans)',
  fontSize: '0.62rem',
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
  fontWeight: 600,
  color: 'var(--text-muted)',
}

export default function MatchingWelcome({ sessionId, sessionName, pseudonym }: Props) {
  const router = useRouter()
  const [joining, setJoining] = useState(false)
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const kind = getPseudonymIllustrationKind(pseudonym)
  const glyph = getPseudonymIllustrationGlyph(kind)
  const photo = getPseudonymPhoto(pseudonym)
  const [photoError, setPhotoError] = useState(false)
  const showPhoto = photo !== null && !photoError

  async function handleJoin() {
    setJoining(true)
    setError(null)
    try {
      const res = await fetch(`/api/matching/sessions/${sessionId}/join`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Не удалось войти в сессию')
      setJoined(true)
      router.refresh()
    } catch (event) {
      setError(event instanceof Error ? event.message : 'Не удалось войти в сессию')
    } finally {
      setJoining(false)
    }
  }

  return (
    <main style={pageStyle}>
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundImage: 'linear-gradient(var(--hair-soft) 1px, transparent 1px)',
          backgroundSize: '100% 2.1rem',
          opacity: 0.5,
          pointerEvents: 'none',
        }}
      />
      <section style={{ ...cardStyle, position: 'relative' }} aria-labelledby="matching-welcome-title">
        {joined ? (
          <>
            <div style={{ ...microStyle, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <span
                aria-hidden="true"
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: 'var(--success)',
                  color: 'var(--bg-input)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.68rem',
                }}
              >
                ✓
              </span>
              Вы в сессии
            </div>
            <h1
              id="matching-welcome-title"
              style={{
                margin: '0.9rem 0 0',
                fontFamily: 'var(--nd-serif)',
                fontSize: '1.55rem',
                lineHeight: 1.15,
              }}
            >
              Добро пожаловать, <em style={{ color: 'var(--accent)' }}>{pseudonym}</em>
            </h1>
            <p style={{ margin: '0.8rem 0 0', fontFamily: 'var(--nd-serif)', fontSize: '1rem', lineHeight: 1.55, color: 'var(--text-body)' }}>
              Теперь твои предпочтения учитываются. Отмечай книги, которые хочешь читать, и наблюдай, как складываются круги.
            </p>
          </>
        ) : (
          <>
            <div style={{ ...microStyle, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span aria-hidden="true" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)' }} />
              Долгое наступление · читательский клуб
            </div>
            <h1
              id="matching-welcome-title"
              style={{
                margin: '0.9rem 0 0',
                fontFamily: 'var(--nd-serif)',
                fontSize: 'clamp(1.55rem, 6vw, 1.9rem)',
                lineHeight: 1.12,
                fontWeight: 700,
                color: 'var(--text)',
              }}
            >
              Добро пожаловать
            </h1>
            <p style={{ margin: '0.85rem 0 0', fontFamily: 'var(--nd-serif)', fontSize: '1.02rem', lineHeight: 1.55, color: 'var(--text-body)' }}>
              Здесь ты сможешь узнать, что хотят читать остальные и какие читательские круги складываются. Добавляй и убирай книги из своего списка, чтобы продвинуть лучший для всех сценарий.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '104px minmax(0, 1fr)',
                marginTop: '1.5rem',
                border: '1px solid var(--hair)',
                background: 'var(--bg-input)',
              }}
            >
              <div
                data-testid="welcome-illustration"
                aria-label={`Иллюстрация ника ${pseudonym}`}
                style={{
                  position: 'relative',
                  minHeight: 132,
                  borderRight: '1px solid var(--hair)',
                  background: 'var(--bg-elevated)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  color: 'var(--accent)',
                  overflow: 'hidden',
                }}
              >
                {showPhoto ? (
                  <Image
                    data-testid="welcome-species-photo"
                    src={photo!.file}
                    alt={`Фотография: ${pseudonym}`}
                    fill
                    sizes="132px"
                    style={{ objectFit: 'cover', borderRadius: 'var(--radius)' }}
                    onError={() => setPhotoError(true)}
                  />
                ) : (
                  <>
                    <span data-testid="welcome-species-glyph" aria-hidden="true" style={{ fontFamily: 'var(--nd-serif)', fontSize: '2.4rem', fontWeight: 700 }}>
                      {glyph}
                    </span>
                    <span style={{ ...microStyle, color: 'var(--text-muted)', textAlign: 'center' }}>{pseudonym}</span>
                  </>
                )}
              </div>
              <div style={{ padding: '0.95rem 1rem', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <div style={microStyle}>Ваш ник</div>
                <div style={{ marginTop: '0.25rem', fontFamily: 'var(--nd-serif)', fontSize: '1.7rem', lineHeight: 1.05, fontWeight: 700 }}>
                  {pseudonym}
                </div>
                <div style={{ marginTop: '0.45rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Сессия: {sessionName}
                </div>
              </div>
            </div>
            {showPhoto && photo && (
              <p style={{ margin: '0.4rem 0 0', ...microStyle, color: 'var(--text-muted)' }}>
                фото: {photo.author} · {photo.license}
              </p>
            )}
            <p style={{ margin: '0.85rem 0 0', fontSize: '0.78rem', lineHeight: 1.5, color: 'var(--text-secondary)' }}>
              Мы <strong style={{ color: 'var(--text)' }}>не показываем настоящие имена</strong>. Тебе присвоен ник «<strong style={{ color: 'var(--text)' }}>{pseudonym}</strong>».
            </p>
            {error && (
              <p role="alert" style={{ margin: '0.85rem 0 0', fontSize: '0.78rem', color: 'var(--accent)' }}>
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={handleJoin}
              disabled={joining}
              style={{
                width: '100%',
                marginTop: '1.5rem',
                padding: '0.92rem 1rem',
                border: 'none',
                borderRadius: 'var(--radius)',
                background: 'var(--accent)',
                color: 'var(--bg-input)',
                fontFamily: 'var(--nd-sans)',
                fontSize: '0.95rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: joining ? 'default' : 'pointer',
              }}
            >
              {joining ? 'Входим…' : 'Войти'}
            </button>
            <p style={{ margin: '0.8rem 0 0', textAlign: 'center', fontSize: '0.72rem', lineHeight: 1.45, color: 'var(--text-muted)' }}>
              После входа ты становишься участником сессии — твои книги начинают влиять на сценарии и ходы.
            </p>
          </>
        )}
      </section>
    </main>
  )
}
