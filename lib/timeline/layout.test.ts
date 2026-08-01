import { tlLayout, type TimelineLayoutEvent } from './layout'

const measureText = (text: string): number => Array.from(text).length * 10

function layout(
  events: TimelineLayoutEvent[],
  capacity = 1,
  width = 100,
  selectedId: string | undefined = undefined,
) {
  return tlLayout({
    events,
    width,
    capacity,
    markerWidth: 8,
    selectedId,
    measureText,
    labelFont: 'label',
    dateFont: 'date',
  })
}

function shift(events: TimelineLayoutEvent[], delta: number): TimelineLayoutEvent[] {
  return events.map((event) => ({
    ...event,
    startX: event.startX + delta,
    ...(event.endX === undefined ? {} : { endX: event.endX + delta }),
  }))
}

function laneMap(result: ReturnType<typeof tlLayout>): Record<string, number> {
  return Object.fromEntries([
    ...result.spans,
    ...result.markers,
    ...result.clusters.flatMap((cluster) => cluster.memberIds.map((id) => ({ id, lane: cluster.lane }))),
  ].map(({ id, lane }) => [id, lane]))
}

describe('tlLayout', () => {
  it('keeps point labels on the right even when the row is clipped by the canvas edge', () => {
    const result = layout([{ id: 'edge', title: 'Событие', dateLabel: '2000', startX: 92 }])

    expect(result.markers[0]).toEqual(expect.objectContaining({ id: 'edge', mode: 'label' }))
    expect(result.markers[0]).not.toHaveProperty('side')
  })

  it('keeps lanes and height stable when all dates pan by the same distance', () => {
    const events: TimelineLayoutEvent[] = [
      { id: 'first', title: 'Первое событие', dateLabel: '1000', startX: 15 },
      { id: 'second', title: 'Второе событие', dateLabel: '1050', startX: 48 },
      { id: 'period', title: 'Период', dateLabel: '1100 — 1150', startX: 72, endX: 94 },
    ]

    const before = layout(events, 3)
    const after = layout(shift(events, -240), 3)

    expect(laneMap(after)).toEqual(laneMap(before))
    expect(after.laneCount).toBe(before.laneCount)
  })

  it('keeps attached lanes stable when library ghosts are added', () => {
    const attached: TimelineLayoutEvent[] = [
      { id: 'first', title: 'Первое событие', dateLabel: '1000', startX: 12 },
      { id: 'second', title: 'Второе событие', dateLabel: '1050', startX: 54 },
    ]
    const ghost = {
      id: 'ghost',
      title: 'Призрачный период',
      dateLabel: '900 — 1200',
      startX: 0,
      endX: 100,
      isLibrary: true,
    }

    const withoutGhosts = laneMap(layout(attached, 3))
    const withGhosts = laneMap(layout([...attached, ghost], 3))

    expect(withGhosts.first).toBe(withoutGhosts.first)
    expect(withGhosts.second).toBe(withoutGhosts.second)
  })

  it('does not let selection change lane assignment', () => {
    const events: TimelineLayoutEvent[] = [
      { id: 'first', title: 'Первое событие', dateLabel: '1000', startX: 10 },
      { id: 'second', title: 'Второе событие', dateLabel: '1010', startX: 40 },
    ]

    expect(laneMap(layout(events, 2, 100, 'second'))).toEqual(
      laneMap(layout(events, 2, 100, undefined)),
    )
  })

  it('allows scale changes to recompute lanes', () => {
    const atWidth = (width: number) => layout([
      { id: 'first', title: 'А', dateLabel: '1', startX: width * 0.2 },
      { id: 'second', title: 'Б', dateLabel: '2', startX: width * 0.5 },
    ], 2, width)

    expect(laneMap(atWidth(100))).not.toEqual(laneMap(atWidth(300)))
  })

  it('keeps an event as a dot when its label does not fit', () => {
    const result = layout([
      { id: 'wide', title: 'Длинная подпись', dateLabel: '1000', startX: 10 },
      { id: 'dot', title: 'Тоже длинная', dateLabel: '1100', startX: 80 },
    ])

    expect(result.markers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'dot', mode: 'dot' }),
    ]))
  })

  it('clusters nearby leftovers but keeps a single leftover as a dot', () => {
    const result = layout([
      { id: 'wide', title: 'Очень длинная подпись события', dateLabel: '1000', startX: 5 },
      { id: 'a', title: 'Альфа', dateLabel: '1010', startX: 35 },
      { id: 'b', title: 'Бета', dateLabel: '1020', startX: 47 },
      { id: 'single', title: 'Один', dateLabel: '1100', startX: 88 },
    ])

    expect(result.clusters).toEqual([
      expect.objectContaining({ count: 2, memberIds: ['a', 'b'] }),
    ])
    expect(result.markers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'single', mode: 'dot' }),
    ]))
  })

  it('never drops an interval when all lanes are occupied', () => {
    const result = layout([
      { id: 'first', title: 'Первый', dateLabel: '1000 — 1100', startX: 10, endX: 70 },
      { id: 'second', title: 'Второй', dateLabel: '1050 — 1150', startX: 40, endX: 90 },
    ])

    expect(result.spans.map(({ id, lane }) => ({ id, lane }))).toEqual([
      { id: 'first', lane: 0 },
      { id: 'second', lane: 0 },
    ])
  })

  it('keeps an interval label anchored after its start outside the canvas', () => {
    const result = layout([
      { id: 'past', title: 'Чужой период', dateLabel: '1800 — 1850', startX: -80, endX: -10 },
    ])

    expect(result.spans[0]).toEqual(expect.objectContaining({ id: 'past', labelled: true }))
    expect(result.spans[0]!.labelX).toBeGreaterThan(result.spans[0]!.startX)
  })

  it('does not reflect an interval label at the right edge', () => {
    const result = layout([
      { id: 'edge-span', title: 'Период', dateLabel: '1900 — 2000', startX: 82, endX: 98 },
    ])
    const span = result.spans[0]!

    expect(span.labelled).toBe(true)
    expect(span.labelX).toBeGreaterThan(span.startX)
  })

  it('keeps offscreen placements in the result and marks their canvas intersection', () => {
    const result = layout([
      { id: 'partly-visible', title: 'Видимая подпись', dateLabel: '1900', startX: -5 },
      { id: 'offscreen', title: 'Далёкая подпись', dateLabel: '1800', startX: -300 },
    ], 2)

    expect(result.markers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'partly-visible', intersectsCanvas: true }),
      expect.objectContaining({ id: 'offscreen', intersectsCanvas: false }),
    ]))
  })
})
