'use client'

import { buildRulerTicks, createViewportTransform, type VisibleRange } from '@/lib/timeline'

interface Props {
  range: VisibleRange
  width: number
}

export const RULER_HEIGHT_PX = 30

/** Линейка лет: крупная засечка подписывается годом, мелкая — только штрих. */
export default function TimelineRuler({ range, width }: Props) {
  const transform = createViewportTransform(range, width)

  return (
    <div
      role="region"
      aria-label="Шкала лет"
      data-testid="timeline-ruler"
      style={{
        position: 'relative',
        height: `${RULER_HEIGHT_PX}px`,
        borderTop: '1px solid var(--border-strong)',
        overflow: 'hidden',
      }}
    >
      {buildRulerTicks(range, width).map((tick) => (
        <span
          key={tick.value}
          style={{
            position: 'absolute',
            left: `${transform.toX(tick.value)}px`,
            top: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
          }}
        >
          <span
            aria-hidden="true"
            style={{
              display: 'block',
              width: '1px',
              height: tick.major ? '8px' : '4px',
              background: tick.major ? 'var(--text-muted)' : 'var(--border)',
            }}
          />
          {tick.major ? (
            <span
              style={{
                fontFamily: 'var(--nd-sans)',
                fontSize: '0.6rem',
                letterSpacing: '0.04em',
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
                paddingTop: '2px',
                transform: 'translateX(-50%)',
              }}
            >
              {tick.label.replace(' BCE', ' до н. э.')}
            </span>
          ) : null}
        </span>
      ))}
    </div>
  )
}
