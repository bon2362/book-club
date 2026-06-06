'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import MatchingPersonalList, { type BookParticipant } from './MatchingPersonalList'
import type { CatalogBook } from '@/lib/matching/personal-list'
import { listHasCompleteActiveRanking } from '@/lib/matching/ranking-readiness'

interface Props {
  books: CatalogBook[]
  bookParticipants: BookParticipant[]
  viewingUserId: string
  mutationUserId?: string
}

export default function MatchingRankingGate({
  books,
  bookParticipants,
  viewingUserId,
  mutationUserId,
}: Props) {
  const router = useRouter()
  const initialCanEnter = useMemo(() => listHasCompleteActiveRanking(books), [books])
  const [canEnter, setCanEnter] = useState(initialCanEnter)

  return (
    <main
      data-testid="ranking-gate"
      style={{
        minHeight: '100svh',
        background: 'var(--bg)',
        color: 'var(--text)',
        position: 'relative',
        padding: '2rem 1rem 0',
      }}
    >
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
      <div style={{ maxWidth: 880, margin: '0 auto', position: 'relative' }}>
        <section style={{ maxWidth: 620 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.7rem' }}>
            <span
              aria-hidden
              style={{ width: 5, height: 5, background: 'var(--accent)', display: 'inline-block' }}
            />
            <span
              style={{
                fontSize: '0.6rem',
                letterSpacing: '0.13em',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              Режим: удовлетворённость · шаг перед доской
            </span>
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--nd-serif), Georgia, serif',
              fontSize: '1.85rem',
              fontWeight: 700,
              lineHeight: 1.14,
              color: 'var(--text)',
            }}
          >
            Сначала расставьте приоритеты
          </h1>
          <p
            style={{
              margin: '0.75rem 0 0',
              fontFamily: 'var(--nd-serif), Georgia, serif',
              fontSize: '1.02rem',
              lineHeight: 1.55,
              color: 'var(--text-body)',
            }}
          >
            В этом режиме важнее всего, какие книги вам хочется читать{' '}
            <em style={{ color: 'var(--accent)', fontStyle: 'italic' }}>сильнее всего</em>.
            Добавьте книги в список справа и расставьте их по порядку.
          </p>
        </section>

        <div
          className="grid"
          style={{
            gridTemplateColumns: 'minmax(0, 1.18fr) minmax(0, 0.82fr)',
            gap: '1.1rem',
            marginTop: '1.6rem',
            paddingBottom: '1.2rem',
          }}
        >
          <MatchingPersonalList
            books={books}
            bookParticipants={bookParticipants}
            viewingUserId={viewingUserId}
            mutationUserId={mutationUserId}
            suppressRefresh
            onChange={setCanEnter}
          />
        </div>

        <div
          style={{
            position: 'sticky',
            bottom: 0,
            marginTop: '1.4rem',
            padding: '0.9rem 0 1rem',
            background: 'var(--bg)',
            borderTop: '1px solid var(--hair)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
            flexWrap: 'wrap',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-secondary)', maxWidth: 540 }}>
            {canEnter ? (
              <>
                Приоритеты сохраняются автоматически. Когда будете готовы —{' '}
                <strong style={{ color: 'var(--text)' }}>войдите в подбор</strong>, и доска со сценариями откроется.
              </>
            ) : (
              'Добавьте хотя бы одну книгу в список, чтобы кнопка стала активной.'
            )}
          </p>
          <button
            type="button"
            data-testid="ranking-gate-enter"
            disabled={!canEnter}
            onClick={() => {
              if (canEnter) router.refresh()
            }}
            style={{
              padding: '0.85rem 1.5rem',
              border: 'none',
              borderRadius: 'var(--radius)',
              background: canEnter ? 'var(--accent)' : 'var(--border)',
              color: canEnter ? 'var(--bg-input)' : 'var(--text-muted)',
              cursor: canEnter ? 'pointer' : 'default',
              fontSize: '0.72rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 700,
            }}
          >
            Войти в подбор →
          </button>
        </div>
      </div>
    </main>
  )
}
