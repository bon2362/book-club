'use client'

import { useState } from 'react'

interface Props {
  onClick: () => void
}

export default function SubmitBookCard({ onClick }: Props) {
  const [hovered, setHovered] = useState(false)

  const accent = '#C0603A'
  const idle = '#D8D2CC'

  return (
    <>
    <button
      className="submit-book-card"
      data-testid="submit-book-card"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Предложить книгу"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        padding: 0,
        background: '#fff',
        border: `1px solid ${hovered ? accent : '#E5E5E5'}`,
        cursor: 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        transition: 'border-color 0.15s',
      }}
    >
      <div
        className="submit-book-card__preview"
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '2/3',
          background: hovered ? '#FEF8F5' : '#FAFAF8',
          overflow: 'hidden',
          transition: 'background 0.15s',
        }}
      >
        <div
          className="submit-book-card__spine"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: '14px',
            background: hovered ? accent : '#E2D9D2',
            transition: 'background 0.15s',
          }}
        />

        <div
          className="submit-book-card__preview-inner"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: '14px',
            right: 0,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '1.25rem 1.1rem',
          }}
        >
          <div
            className="submit-book-card__plus"
            style={{
              alignSelf: 'flex-start',
              width: '32px',
              height: '32px',
              border: `1.5px solid ${hovered ? accent : idle}`,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'border-color 0.15s',
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={hovered ? accent : '#9A8E84'}
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
              style={{ transition: 'stroke 0.15s' }}
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </div>

          <div className="submit-book-card__lines" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            <div style={{ height: '6px', width: '85%', background: idle }} />
            <div style={{ height: '6px', width: '70%', background: idle }} />
            <div style={{ height: '6px', width: '55%', background: idle }} />
          </div>

          <div />
        </div>
      </div>

      <div className="submit-book-card__copy" style={{ padding: '0.75rem 0.85rem 0.9rem', borderTop: '1px solid #F0EBE6' }}>
        <div
          style={{
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.78rem',
            fontWeight: 600,
            color: hovered ? accent : '#111',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            transition: 'color 0.15s',
          }}
        >
          Предложить книгу
        </div>
        <div
          style={{
            marginTop: '0.25rem',
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.7rem',
            color: '#888',
            lineHeight: 1.4,
          }}
        >
          Расскажите, что и&nbsp;почему стоит прочитать
        </div>
      </div>
    </button>
    <style jsx>{`
      @media (max-width: 640px) {
        .submit-book-card {
          flex-direction: row !important;
          align-items: stretch;
          min-height: 72px;
        }

        .submit-book-card__preview {
          width: 72px !important;
          flex: 0 0 72px;
          aspect-ratio: auto !important;
          min-height: 72px;
        }

        .submit-book-card__spine {
          width: 8px !important;
        }

        .submit-book-card__preview-inner {
          left: 8px !important;
          padding: 0.75rem 0.65rem !important;
          justify-content: center !important;
        }

        .submit-book-card__plus {
          width: 28px !important;
          height: 28px !important;
        }

        .submit-book-card__lines {
          display: none !important;
        }

        .submit-book-card__copy {
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          min-width: 0;
          padding: 0.75rem 0.85rem !important;
          border-top: none !important;
          border-left: 1px solid #F0EBE6;
        }
      }
    `}</style>
    </>
  )
}
