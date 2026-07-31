'use client'

import SummaryMarkdown from '../SummaryMarkdown'
import { normalizeDataColor } from './data-color'
import { formatDateRange } from './format-historical-date'
import type { TimelineEventView } from '@/lib/timeline/view-model'

interface Props {
  events: TimelineEventView[]
}

/**
 * Узкий экран ленту не показывает — по решению владельца раздел десктопный.
 * Вместо полотна вертикальный список событий по хронологии. Переключение
 * делает CSS: серверный рендер не знает ширину экрана, и определение её через
 * хук расходилось бы с разметкой при гидратации.
 */
export default function TimelineMobileList({ events }: Props) {
  if (events.length === 0) {
    return (
      <p style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
        В этом таймлайне пока нет событий.
      </p>
    )
  }

  return (
    <ol data-testid="timeline-mobile-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {events.map((event) => (
        <li
          key={event.id}
          data-testid="timeline-mobile-event"
          style={{
            borderLeft: `3px solid ${normalizeDataColor(event.color)}`,
            paddingLeft: '0.9rem',
            marginBottom: '1.4rem',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--nd-sans)',
              fontSize: '0.6rem',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--text-muted)',
              margin: 0,
            }}
          >
            {formatDateRange(event)} · {event.typeTitle}
          </p>
          <h3
            style={{
              fontFamily: 'var(--nd-serif)',
              fontSize: '1.05rem',
              color: 'var(--text)',
              margin: '0.25rem 0 0.4rem',
            }}
          >
            {event.title}
          </h3>
          {event.description ? <SummaryMarkdown markdown={event.description} /> : null}
        </li>
      ))}
    </ol>
  )
}
