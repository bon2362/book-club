'use client'

import Image from 'next/image'
import SummaryMarkdown from '../SummaryMarkdown'
import { normalizeDataColor, normalizeEpochColor } from './data-color'
import { formatDateRange } from './format-historical-date'
import type { TimelineEpochView, TimelineEventView } from '@/lib/timeline/view-model'

interface Props {
  selected: { kind: 'event'; item: TimelineEventView } | { kind: 'epoch'; item: TimelineEpochView } | null
  onClose: () => void
}

/**
 * Карточка выбранного элемента. Не модальное окно — панель над лентой, чтобы
 * не перекрывать полотно и не требовать ловушки фокуса.
 */
export default function TimelineDetailCard({ selected, onClose }: Props) {
  if (selected === null) {
    return (
      <div
        data-testid="timeline-detail-empty"
        style={{
          paddingTop: '1.15rem',
          fontFamily: 'var(--nd-sans)',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
        }}
      >
        Выберите событие или эпоху на ленте — <b style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>подробности появятся здесь</b>.
      </div>
    )
  }

  const { item } = selected
  const color = selected.kind === 'epoch' ? normalizeEpochColor(item.color) : normalizeDataColor(item.color)
  const dateLabel = selected.kind === 'event'
    ? formatDateRange(selected.item)
    : formatDateRange({ start: selected.item.start, end: selected.item.end })
  const kindLabel = selected.kind === 'event' ? selected.item.typeTitle : 'Эпоха'
  const isPoint = selected.kind === 'event' && selected.item.end === undefined && !selected.item.ongoing

  return (
    <article
      data-testid="timeline-detail"
      style={{
        paddingTop: '0.35rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', paddingTop: '0.65rem' }}>
        <span
          style={{
            font: '0.72rem/1 var(--nd-mono)',
            color: 'var(--text-secondary)',
            letterSpacing: '0.02em',
          }}
        >
          {dateLabel}
        </span>
        {isPoint ? (
          <span style={{ padding: '0.15rem 0.35rem', boxShadow: 'inset 0 0 0 1px var(--hair)', color: 'var(--text-muted)', font: '0.6rem/1 var(--nd-sans)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Одна дата
          </span>
        ) : null}
        <span aria-hidden="true" style={{ width: '7px', height: '7px', borderRadius: selected.kind === 'event' ? '50%' : 0, background: color, flex: 'none' }} />
        <span style={{ color: 'var(--text-muted)', font: '0.6rem/1 var(--nd-sans)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          {kindLabel}
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

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1.1rem', paddingTop: '0.35rem' }}>
        {item.imageUrl ? (
        <figure style={{ position: 'relative', flex: 'none', width: selected.kind === 'event' ? '80px' : '140px', height: selected.kind === 'event' ? '106px' : '94px', margin: 0, background: 'var(--surface-soft)', boxShadow: 'inset 0 0 0 1px var(--hair)' }}>
          <Image
            src={item.imageUrl}
            alt={item.imageCaption ?? item.title}
            fill
            unoptimized
            style={{ objectFit: 'cover' }}
          />
        </figure>
        ) : null}

        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 style={{ margin: '0.3rem 0 0', color: 'var(--text)', font: '700 1.45rem/1.2 var(--nd-serif)', letterSpacing: '-0.015em' }}>
            {item.title}
          </h2>

          {item.description ? <div className="nd-timeline-detail-body"><SummaryMarkdown markdown={item.description} /></div> : null}

          {item.note ? (
            <div className="nd-timeline-detail-note"><SummaryMarkdown markdown={item.note} /></div>
          ) : null}
        </div>
      </div>
    </article>
  )
}
