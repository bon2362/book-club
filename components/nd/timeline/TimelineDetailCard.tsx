'use client'

import Image from 'next/image'
import SummaryMarkdown from '../SummaryMarkdown'
import { normalizeDataColor } from './data-color'
import { formatDateRange } from './format-historical-date'
import type { TimelineEpochView, TimelineEventView } from '@/lib/timeline/view-model'

interface Props {
  selected: { kind: 'event'; item: TimelineEventView } | { kind: 'epoch'; item: TimelineEpochView } | null
  onClose: () => void
}

/**
 * Карточка выбранного элемента. Не модальное окно — панель под лентой, чтобы
 * не перекрывать полотно и не требовать ловушки фокуса.
 */
export default function TimelineDetailCard({ selected, onClose }: Props) {
  if (selected === null) {
    return (
      <div
        data-testid="timeline-detail-empty"
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          background: 'var(--bg-input)',
          padding: '1rem 1.2rem',
          fontFamily: 'var(--nd-sans)',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
        }}
      >
        Выберите событие или эпоху на ленте, чтобы прочитать подробности.
      </div>
    )
  }

  const { item } = selected
  const color = normalizeDataColor(item.color)
  const dateLabel = selected.kind === 'event'
    ? formatDateRange(selected.item)
    : formatDateRange({ start: selected.item.start, end: selected.item.end })
  const kindLabel = selected.kind === 'event' ? selected.item.typeTitle : 'Эпоха'

  return (
    <article
      data-testid="timeline-detail"
      style={{
        border: '1px solid var(--border)',
        borderLeft: `3px solid ${color}`,
        borderRadius: 'var(--radius)',
        background: 'var(--bg-input)',
        padding: '1rem 1.2rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '1rem' }}>
        <span
          style={{
            fontFamily: 'var(--nd-sans)',
            fontSize: '0.6rem',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--text-muted)',
          }}
        >
          {kindLabel} · {dateLabel}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Закрыть карточку"
          style={{
            marginLeft: 'auto',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--nd-sans)',
            fontSize: '0.6rem',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--text-muted)',
          }}
        >
          Закрыть
        </button>
      </div>

      <h2
        style={{
          fontFamily: 'var(--nd-serif)',
          fontSize: '1.2rem',
          letterSpacing: '-0.01em',
          color: 'var(--text)',
          margin: '0.4rem 0 0.6rem',
        }}
      >
        {item.title}
      </h2>

      {item.imageUrl ? (
        <figure style={{ margin: '0 0 0.8rem' }}>
          <Image
            src={item.imageUrl}
            alt={item.imageCaption ?? item.title}
            width={640}
            height={360}
            unoptimized
            style={{ width: '100%', height: 'auto', border: '1px solid var(--border)' }}
          />
          {item.imageCaption ? (
            <figcaption
              style={{
                fontFamily: 'var(--nd-sans)',
                fontSize: '0.7rem',
                color: 'var(--text-muted)',
                paddingTop: '0.3rem',
              }}
            >
              {item.imageCaption}
            </figcaption>
          ) : null}
        </figure>
      ) : null}

      {item.description ? <SummaryMarkdown markdown={item.description} /> : null}

      {item.note ? (
        <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.8rem', paddingTop: '0.8rem' }}>
          <p
            style={{
              fontFamily: 'var(--nd-sans)',
              fontSize: '0.6rem',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--text-muted)',
              margin: '0 0 0.4rem',
            }}
          >
            Заметка к таймлайну
          </p>
          <SummaryMarkdown markdown={item.note} />
        </div>
      ) : null}
    </article>
  )
}
