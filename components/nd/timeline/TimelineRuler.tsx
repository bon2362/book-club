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
        height: '34px',
        marginInline: 'calc(-1 * var(--tl-gut))',
        borderTop: '1px solid var(--tl-axis)',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'relative', width: `${width}px`, height: '100%', margin: '0 auto' }}>
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
              background: tick.major ? 'var(--tl-tick)' : 'var(--tl-tick-soft)',
            }}
          />
          {tick.major ? (
            <span
              style={{
                font: '0.68rem/1 var(--nd-mono)',
                color: 'var(--text-muted)',
                whiteSpace: 'nowrap',
                paddingTop: '3px',
                transform: 'translateX(-50%)',
              }}
            >
              {tick.label.replace(' BCE', ' до н. э.')}
            </span>
          ) : null}
        </span>
      ))}
      </div>
    </div>
  )
}
