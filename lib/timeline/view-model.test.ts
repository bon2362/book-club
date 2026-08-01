/**
 * @jest-environment node
 */
import {
  buildTimelineView,
  resolveTimelineInitialRange,
  type TimelineEpochRow,
  type TimelineEventRow,
  type TimelineRow,
} from './view-model'
import { historicalDateSchema } from './historical-date'

const timeline: TimelineRow = {
  id: 'tl-1',
  slug: 'vseobschaya-istoriya',
  title: 'Всеобщая история',
  description: 'Описание',
  published: true,
  viewportStart: -500,
  viewportEnd: 2000,
  filterTypeIds: ['type-war'],
  epochsVisible: true,
  showAll: false,
}

function eventRow(overrides: Partial<TimelineEventRow> = {}): TimelineEventRow {
  return {
    id: 'ev-1',
    title: 'Событие',
    typeId: 'type-war',
    typeTitle: 'Война',
    color: '#C0603A',
    icon: '⚔',
    startYear: 1914,
    startEra: 'CE',
    startMonth: null,
    startDay: null,
    endYear: null,
    endEra: null,
    endMonth: null,
    endDay: null,
    ongoing: false,
    description: 'Текст',
    imageUrl: null,
    imageCaption: null,
    note: '',
    ...overrides,
  }
}

function epochRow(overrides: Partial<TimelineEpochRow> = {}): TimelineEpochRow {
  return {
    id: 'ep-1',
    title: 'Античность',
    startYear: 800,
    startEra: 'BCE',
    startMonth: null,
    startDay: null,
    endYear: 476,
    endEra: 'CE',
    endMonth: null,
    endDay: null,
    description: '',
    imageUrl: null,
    imageCaption: null,
    note: '',
    color: '#2D6A4F',
    visible: true,
    pinnedLane: null,
    ...overrides,
  }
}

describe('buildTimelineView', () => {
  it('собирает событие вместе с цветом и иконкой его типа', () => {
    const view = buildTimelineView({
      timeline,
      events: [eventRow({ color: '#123456', icon: '🏛', typeTitle: 'Культура' })],
      epochs: [],
    })

    expect(view.events[0]).toMatchObject({
      typeId: 'type-war',
      typeTitle: 'Культура',
      color: '#123456',
      icon: '🏛',
    })
  })

  it('берёт цвет эпохи из связи таймлайна, а не из самой эпохи', () => {
    const view = buildTimelineView({
      timeline,
      epochs: [epochRow({ color: '#AA1111' })],
      events: [],
    })

    expect(view.epochs[0].color).toBe('#AA1111')
  })

  it('сортирует события хронологически: до н. э. раньше н. э.', () => {
    const view = buildTimelineView({
      timeline,
      events: [
        eventRow({ id: 'ce', title: 'Наша эра', startYear: 100, startEra: 'CE' }),
        eventRow({ id: 'bce-old', title: 'Древнее', startYear: 500, startEra: 'BCE' }),
        eventRow({ id: 'bce-new', title: 'Позднее', startYear: 100, startEra: 'BCE' }),
      ],
      epochs: [],
    })

    expect(view.events.map((event) => event.id)).toEqual(['bce-old', 'bce-new', 'ce'])
  })

  it('событие без даты конца отдаёт end: undefined, а не null', () => {
    const view = buildTimelineView({ timeline, events: [eventRow()], epochs: [] })

    expect(view.events[0].end).toBeUndefined()
    expect('end' in view.events[0]).toBe(false)
  })

  it('интервал получает дату конца из своих колонок', () => {
    const view = buildTimelineView({
      timeline,
      events: [eventRow({ endYear: 1918, endEra: 'CE', endMonth: 11, endDay: 11 })],
      epochs: [],
    })

    expect(view.events[0].end).toEqual({ year: 1918, era: 'CE', month: 11, day: 11 })
  })

  it('null в месяце и дне превращается в отсутствующее поле — схема дат строгая', () => {
    const view = buildTimelineView({
      timeline,
      events: [eventRow({ startMonth: null, startDay: null })],
      epochs: [],
    })

    expect(view.events[0].start).toEqual({ year: 1914, era: 'CE' })
    expect(() => historicalDateSchema.parse(view.events[0].start)).not.toThrow()
  })

  it('невидимая эпоха остаётся в наборе с флагом visible: false', () => {
    const view = buildTimelineView({
      timeline,
      epochs: [epochRow({ visible: false })],
      events: [],
    })

    expect(view.epochs).toHaveLength(1)
    expect(view.epochs[0].visible).toBe(false)
  })

  it('закреплённая дорожка эпохи переносится, отсутствующая — опускается', () => {
    const view = buildTimelineView({
      timeline,
      epochs: [epochRow({ id: 'pinned', pinnedLane: 2 }), epochRow({ id: 'free', pinnedLane: null })],
      events: [],
    })

    expect(view.epochs.find((epoch) => epoch.id === 'pinned')?.pinnedLane).toBe(2)
    expect(view.epochs.find((epoch) => epoch.id === 'free')).not.toHaveProperty('pinnedLane')
  })

  it('переносит сохранённый вид и настройки фильтра', () => {
    const view = buildTimelineView({ timeline, events: [], epochs: [] })

    expect(view).toMatchObject({
      viewportStart: -500,
      viewportEnd: 2000,
      filterTypeIds: ['type-war'],
      epochsVisible: true,
      showAll: false,
    })
  })

  it('пустой таймлайн даёт пустые массивы, а не падение', () => {
    const view = buildTimelineView({
      timeline: { ...timeline, filterTypeIds: null, viewportStart: null, viewportEnd: null },
      events: [],
      epochs: [],
    })

    expect(view.events).toEqual([])
    expect(view.epochs).toEqual([])
    expect(view.filterTypeIds).toEqual([])
  })
})

describe('resolveTimelineInitialRange', () => {
  function viewWithSavedRange(inside: number) {
    const events = Array.from({ length: 31 }, (_, index) => eventRow({
      id: `event-${index}`,
      title: `Событие ${index}`,
      startYear: index < inside ? 1000 + index : 2000 + index,
    }))
    return buildTimelineView({
      timeline: { ...timeline, viewportStart: 999, viewportEnd: 1010 },
      events,
      epochs: [],
    })
  }

  it('rejects the saved range when it contains only 4 of 31 items', () => {
    const view = viewWithSavedRange(4)

    expect(resolveTimelineInitialRange(view)).not.toEqual({ start: 999, end: 1010 })
  })

  it('accepts the saved range when it contains 8 of 31 items', () => {
    const view = viewWithSavedRange(8)

    expect(resolveTimelineInitialRange(view)).toEqual({ start: 999, end: 1010 })
  })
})
