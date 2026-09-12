'use client'

import Link from 'next/link'
import { track } from '@/lib/analytics'

interface MatchingStripProps {
  onClose: () => void
}

export default function MatchingStrip({ onClose }: MatchingStripProps) {
  return (
    <aside className="nd-matching-strip" aria-label="Матчинг">
      <div className="nd-matching-strip__in">
        <div className="nd-matching-strip__body">
          <div className="nd-matching-strip__eyebrow">
            <span className="nd-matching-strip__dot" aria-hidden="true" />
            Идёт матчинг
          </div>
          <p className="nd-matching-strip__title">Выбираем книги и собираем круги на новый сезон</p>
        </div>
        <Link className="nd-matching-strip__cta" href="/matching" onClick={() => track('matching_strip_clicked', { source: 'home' })}>
          Перейти в матчинг <span aria-hidden="true">→</span>
        </Link>
        <button
          className="nd-matching-strip__close"
          type="button"
          onClick={() => { track('matching_strip_dismissed', { source: 'home' }); onClose() }}
          aria-label="Скрыть полосу матчинга"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </aside>
  )
}
