'use client'

import { useSession, signOut } from 'next-auth/react'
import Link from 'next/link'
import SubmitBookButton from './SubmitBookButton'

interface Props {
  onEditProfile?: () => void
  onSignIn?: () => void
  onSubmitBook?: () => void
  onWhatIsThis?: () => void
}

export default function Header({ onEditProfile, onSignIn, onSubmitBook, onWhatIsThis }: Props) {
  const { data: session } = useSession()

  return (
    <header
      style={{
        borderBottom: '2px solid #000',
        background: '#fff',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0.75rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
        }}
      >
        {/* Left: label + "Что это?" */}
        <div className="nd-header-label" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <span
            style={{
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.6rem',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              color: '#999',
            }}
          >
            Читательские круги
          </span>
          {onWhatIsThis && (
            <button
              onClick={onWhatIsThis}
              style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.8rem',
                color: '#555',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              Что это?
            </button>
          )}
        </div>

        {/* Center: title */}
        <Link
          href="/"
          style={{
            fontFamily: 'var(--nd-serif), Georgia, serif',
            fontSize: '1.25rem',
            color: '#111',
            textDecoration: 'none',
            letterSpacing: '-0.01em',
          }}
        >
          Долгое наступление
        </Link>

        {/* Right: auth */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: '1rem',
          }}
        >
          {onSubmitBook && (
            <span className="nd-header-submit">
              <SubmitBookButton onClick={onSubmitBook} />
            </span>
          )}
          {session?.user ? (
            <>
              {/* Desktop: имя (кликабельное) */}
              {onEditProfile && (
                <button
                  className="nd-header-profile-btn"
                  onClick={onEditProfile}
                  style={{
                    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                    fontSize: '0.7rem',
                    color: '#666',
                    background: 'none',
                    border: 'none',
                    borderBottom: '1px solid #bbb',
                    cursor: 'pointer',
                    padding: '0 0 1px',
                    maxWidth: '140px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {session.user.name ?? session.user.email}
                </button>
              )}
              {/* Mobile: аватар-кружок с инициалом */}
              {onEditProfile && (
                <button
                  className="nd-header-avatar"
                  onClick={onEditProfile}
                  title="Профиль"
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: '#111',
                    color: '#fff',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  {(session.user.name ?? session.user.email ?? '?')[0].toUpperCase()}
                </button>
              )}
              <button
                onClick={() => signOut()}
                title="Выйти"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: '2px',
                  color: '#111',
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              </button>
            </>
          ) : (
            <button
              onClick={onSignIn}
              style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.65rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#111',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid #111',
                cursor: 'pointer',
                padding: '0 0 1px',
              }}
            >
              Войти
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
