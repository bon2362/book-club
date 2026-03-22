'use client'

import { useState, useRef, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import SubmitBookButton from './SubmitBookButton'
import { useScrollHide } from '@/lib/scroll-hide-context'

interface Props {
  onEditProfile?: () => void
  onSignIn?: () => void
  onSubmitBook?: () => void
  onWhatIsThis?: () => void
  isAdmin?: boolean
  displayName?: string | null
}

export default function Header({ onEditProfile, onSignIn, onSubmitBook, onWhatIsThis, isAdmin, displayName }: Props) {
  const { data: session } = useSession()
  const [whatIsThisHovered, setWhatIsThisHovered] = useState(false)
  const { isHidden } = useScrollHide()
  const headerRef = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => {
      document.documentElement.style.setProperty(
        '--header-height',
        `${entry.contentRect.height}px`
      )
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <header
      ref={headerRef}
      style={{
        borderBottom: '2px solid #000',
        background: '#fff',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        transform: isHidden ? 'translateY(-100%)' : 'translateY(0)',
        transition: 'transform 0.25s ease',
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
            className="nd-header-club-label"
            style={{
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.6rem',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              color: '#999',
              lineHeight: 1,
            }}
          >
            Читательские круги
          </span>
          {onWhatIsThis && (
            <button
              onClick={onWhatIsThis}
              onMouseEnter={() => setWhatIsThisHovered(true)}
              onMouseLeave={() => setWhatIsThisHovered(false)}
              style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.6rem',
                textTransform: 'uppercase',
                letterSpacing: '0.15em',
                color: whatIsThisHovered ? '#111' : '#999',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                lineHeight: 1,
                transition: 'color 0.15s',
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
            alignItems: 'baseline',
            gap: '1rem',
          }}
        >
          {isAdmin && (
            <Link
              href="/admin"
              prefetch={false}
              className="nd-header-admin-link"
              style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.65rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: '#888',
                textDecoration: 'none',
                borderBottom: '1px solid #ccc',
                padding: '0 0 1px',
                whiteSpace: 'nowrap',
              }}
            >
              Админ
            </Link>
          )}
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
                  {displayName || (session.user.name ?? session.user.email)}
                </button>
              )}
              {/* Mobile: кнопка входа в админку */}
              {isAdmin && (
                <Link
                  href="/admin"
                  prefetch={false}
                  className="nd-header-admin-btn"
                  title="Админка"
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: '50%',
                    background: '#555',
                    color: '#fff',
                    border: 'none',
                    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    textDecoration: 'none',
                  }}
                >
                  А
                </Link>
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
                  {(displayName || session.user.name || session.user.email || '?')[0].toUpperCase()}
                </button>
              )}
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
