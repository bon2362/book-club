import { tlLayout, type TimelineLayoutEvent } from './layout'

const measureText = (text: string): number => Array.from(text).length * 10

function layout(events: TimelineLayoutEvent[], capacity = 1) {
  return tlLayout({
    events,
    width: 100,
    capacity,
    markerWidth: 8,
    selectedId: undefined,
    measureText,
    labelFont: 'label',
    dateFont: 'date',
  })
}

describe('tlLayout', () => {
  it('reflects a point label to the left at the right edge', () => {
    const result = layout([{ id: 'edge', title: 'Событие', dateLabel: '2000', startX: 92 }])

    expect(result.markers[0]).toEqual(expect.objectContaining({
      id: 'edge',
      mode: 'label',
      side: 'left',
    }))
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

  it('does not label an interval entirely outside the canvas', () => {
    const result = layout([
      { id: 'past', title: 'Чужой период', dateLabel: '1800 — 1850', startX: -80, endX: -10 },
    ])

    expect(result.spans[0]).toEqual(expect.objectContaining({ id: 'past', labelled: false }))
  })

  it('grows an interval label left from its start at the right edge', () => {
    const result = layout([
      { id: 'edge-span', title: 'Период', dateLabel: '1900 — 2000', startX: 82, endX: 98 },
    ])
    const span = result.spans[0]!

    expect(span.labelled).toBe(true)
    expect(span.labelX).toBeLessThan(span.startX)
  })
})
