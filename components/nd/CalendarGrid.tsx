'use client'

import { Fragment, useMemo, useRef, useState } from 'react'
import type { OverlapResult } from '@/lib/calendar/overlap'
import { addSlots, slotKey } from '@/lib/calendar/slots'

export interface CalendarColumn {
  day: Date
  hiddenGap?: boolean
}

export default function CalendarGrid({
  columns,
  slotRange,
  overlap,
  viewerFreeKeys,
  markerFreeKeys,
  focusRef,
  canEdit,
  selectedKey,
  isMobile,
  participantCount,
  onPaint,
  onCellClick,
}: {
  columns: CalendarColumn[]
  slotRange: [number, number]
  overlap: OverlapResult
  viewerFreeKeys: ReadonlySet<string>
  markerFreeKeys: ReadonlySet<string>
  focusRef: string | null
  canEdit: boolean
  selectedKey: string | null
  isMobile: boolean
  participantCount: number
  onPaint: (keys: string[], mode: 'paint' | 'erase') => void
  onCellClick: (key: string) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  const [painting, setPainting] = useState(false)
  const drag = useRef<{ mode: 'paint' | 'erase'; touched: Set<string> } | null>(null)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const slots = useMemo(() => {
    const out: number[] = []
    for (let slot = slotRange[0]; slot < slotRange[1]; slot += 1) out.push(slot)
    return out
  }, [slotRange])
  const gridTemplateColumns = `52px ${columns.map((column) => column.hiddenGap ? '9px' : 'minmax(0, 1fr)').join(' ')}`

  function keyFor(day: Date, halfHour: number) {
    return slotKey(addSlots(day, halfHour))
  }

  function paintOne(key: string) {
    const current = drag.current
    if (!current || current.touched.has(key)) return
    current.touched.add(key)
    onPaint([key], current.mode)
  }

  function begin(key: string, pointerType: string) {
    if (!canEdit) return
    const mode = viewerFreeKeys.has(key) ? 'erase' : 'paint'
    drag.current = { mode, touched: new Set() }
    if (pointerType === 'mouse') {
      setPainting(true)
      return
    }
    holdTimer.current = setTimeout(() => {
      setPainting(true)
      paintOne(key)
    }, 320)
  }

  function finish(key: string) {
    if (holdTimer.current) clearTimeout(holdTimer.current)
    const current = drag.current
    drag.current = null
    setPainting(false)
    if (!current || current.touched.size === 0) onCellClick(key)
  }

  return (
    <div
      data-testid="calendar-grid"
      style={{
        display: 'grid',
        gridTemplateColumns,
        userSelect: 'none',
        touchAction: painting ? 'none' : 'pan-y',
      }}
    >
      <div />
      {columns.map((column, index) => column.hiddenGap ? (
        <div key={`gap-head-${index}`} aria-hidden="true" style={{ width: 9 }} />
      ) : (
        <div key={column.day.toISOString()} style={{ textAlign: 'center', paddingBottom: 8, color: 'var(--text-secondary)', fontSize: '0.68rem', lineHeight: 1.25 }}>
          <span>{formatWeekday(column.day)}</span>
          <b style={{ display: 'block', color: 'var(--text)', fontSize: '0.9rem' }}>{formatDay(column.day)}</b>
        </div>
      ))}
      {slots.map((halfHour) => (
        <Fragment key={`slot-${halfHour}`}>
          <div key={`time-${halfHour}`} style={{ height: 'var(--calendar-cell-h, 22px)', color: 'var(--text-muted)', fontFamily: 'var(--nd-mono)', fontSize: '0.63rem', textAlign: 'right', paddingRight: 8, transform: 'translateY(-0.4em)' }}>
            {halfHour % 2 === 0 ? formatSlot(addSlots(columns.find((c) => !c.hiddenGap)?.day ?? new Date(), halfHour)) : ''}
          </div>
          {columns.map((column, index) => {
            if (column.hiddenGap) {
              return <div key={`gap-${index}-${halfHour}`} aria-hidden="true" style={{ borderLeft: '1px solid var(--hair)', margin: '0 4px' }} />
            }
            const key = keyFor(column.day, halfHour)
            const cell = overlap.cells.get(key)
            const candidate = overlap.candidateStarts.has(key)
            const covered = overlap.candidateCovered.has(key)
            const previousKey = slotKey(addSlots(new Date(key), -1))
            const previousVisible = halfHour > slotRange[0]
            const markedByEditor = markerFreeKeys.has(key)
            const mineStart = markedByEditor && (!previousVisible || !markerFreeKeys.has(previousKey))
            const freeCount = focusRef
              ? cell?.freeRefs.includes(focusRef) ? 1 : 0
              : cell?.freeRefs.length ?? 0
            const ratio = participantCount > 0 ? freeCount / participantCount : 0
            const tone = ratio === 0
              ? 'transparent'
              : candidate || (covered && freeCount === participantCount)
                ? 'color-mix(in srgb, var(--success) 62%, transparent)'
                : `color-mix(in srgb, var(--success) ${Math.round(10 + 28 * ratio)}%, transparent)`
            return (
              <button
                key={key}
                type="button"
                data-cell={key}
                data-testid="calendar-cell"
                aria-label={`${formatDay(column.day)} ${formatSlot(addSlots(column.day, halfHour))}`}
                onPointerDown={(event) => begin(key, event.pointerType)}
                onPointerEnter={() => {
                  setHover(key)
                  if (painting) paintOne(key)
                }}
                onPointerLeave={() => setHover((current) => current === key ? null : current)}
                onPointerUp={() => finish(key)}
                style={{
                  position: 'relative',
                  height: 'var(--calendar-cell-h, 22px)',
                  border: 'none',
                  borderTop: halfHour % 2 === 0 ? '1px solid var(--hair-soft)' : 'none',
                  borderRight: index === columns.length - 1 ? 'none' : '1px solid var(--hair-soft)',
                  background: tone,
                  cursor: canEdit ? 'pointer' : 'default',
                  outline: selectedKey === key ? '2px solid var(--text)' : hover === key ? '1px solid var(--text)' : 'none',
                  outlineOffset: selectedKey === key ? -2 : -1,
                  padding: 0,
                }}
              >
                {mineStart && (
                  <span
                    aria-hidden="true"
                    data-mine-marker="true"
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      width: 0,
                      height: 0,
                      borderTop: '8px solid color-mix(in srgb, var(--success-hover) 85%, transparent)',
                      borderRight: '8px solid transparent',
                    }}
                  />
                )}
                {!isMobile && hover === key && candidate && canEdit && (
                  <span style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 5,
                    background: 'var(--text)',
                    color: 'var(--bg-input)',
                    fontSize: '0.62rem',
                    padding: '4px 7px',
                    borderRadius: 'var(--radius-control)',
                    whiteSpace: 'nowrap',
                    boxShadow: 'var(--shadow-pop)',
                  }}>
                    Назначить встречу на {formatSlot(new Date(key))}
                  </span>
                )}
              </button>
            )
          })}
        </Fragment>
      ))}
    </div>
  )
}

function formatWeekday(day: Date) {
  return new Intl.DateTimeFormat('ru', { weekday: 'short', timeZone: 'UTC' }).format(day)
}

function formatDay(day: Date) {
  return new Intl.DateTimeFormat('ru', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(day)
}

function formatSlot(day: Date) {
  return new Intl.DateTimeFormat('ru', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }).format(day)
}
