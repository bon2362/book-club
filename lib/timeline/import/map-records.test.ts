import {
  buildImageUrlIndex,
  mapEpoch,
  mapEvent,
  mapEventType,
  mapTimeline,
  mapTimelineEpoch,
} from './map-records'
import type { SqliteEpochRow, SqliteEventRow, SqliteTimelineRow } from './export-shape'

const baseEvent: SqliteEventRow = {
  id: 'e1',
  title: 'Событие',
  event_type_id: 't1',
  start_year: 1618,
  start_era: 'CE',
  start_month: null,
  start_day: null,
  end_year: null,
  end_era: null,
  end_month: null,
  end_day: null,
  ongoing: 0,
  description_html: '',
  image_id: null,
  image_caption: null,
}

describe('buildImageUrlIndex', () => {
  it('maps an external image id to its address', () => {
    const index = buildImageUrlIndex([
      { id: 'i1', source_type: 'external', source_value: 'https://example.com/a.png' },
    ])
    expect(index.get('i1')).toBe('https://example.com/a.png')
  })

  it('throws on an uploaded image because the file has nowhere to live', () => {
    expect(() => buildImageUrlIndex([
      { id: 'i2', source_type: 'upload', source_value: 'local/file.png' },
    ])).toThrow(/i2/)
  })
})

describe('mapEvent', () => {
  it('turns the SQLite integer flag into a boolean', () => {
    expect(mapEvent({ ...baseEvent, ongoing: 1 }, new Map()).ongoing).toBe(true)
    expect(mapEvent(baseEvent, new Map()).ongoing).toBe(false)
  })

  it('keeps a BCE start year with its era', () => {
    const row = { ...baseEvent, start_year: 44, start_era: 'BCE' as const }
    expect(mapEvent(row, new Map())).toMatchObject({ startYear: 44, startEra: 'BCE' })
  })

  it('carries a full end date across', () => {
    const row = { ...baseEvent, end_year: 1648, end_era: 'CE' as const, end_month: 10, end_day: 24 }
    expect(mapEvent(row, new Map())).toMatchObject({
      endYear: 1648, endEra: 'CE', endMonth: 10, endDay: 24,
    })
  })

  it('leaves every end field null for a point event', () => {
    expect(mapEvent(baseEvent, new Map())).toMatchObject({
      endYear: null, endEra: null, endMonth: null, endDay: null,
    })
  })

  it('converts the description to markdown', () => {
    const row = { ...baseEvent, description_html: '<p>Текст со <strong>значением</strong></p>' }
    expect(mapEvent(row, new Map()).description).toBe('Текст со **значением**')
  })

  it('resolves the image id to its address', () => {
    const row = { ...baseEvent, image_id: 'i1', image_caption: 'Подпись' }
    const index = new Map([['i1', 'https://example.com/a.png']])
    expect(mapEvent(row, index)).toMatchObject({
      imageUrl: 'https://example.com/a.png',
      imageCaption: 'Подпись',
    })
  })

  it('throws when the image id is missing from the index', () => {
    const row = { ...baseEvent, image_id: 'ghost' }
    expect(() => mapEvent(row, new Map())).toThrow(/ghost/)
  })
})

describe('mapEpoch', () => {
  const baseEpoch: SqliteEpochRow = {
    id: 'p1',
    title: 'Эпоха',
    start_year: 476,
    start_era: 'CE',
    start_month: null,
    start_day: null,
    end_year: 1453,
    end_era: 'CE',
    end_month: null,
    end_day: null,
    description_html: '',
    image_id: null,
    image_caption: null,
  }

  it('keeps both boundaries because an epoch always has an end', () => {
    expect(mapEpoch(baseEpoch, new Map())).toMatchObject({
      startYear: 476, startEra: 'CE', endYear: 1453, endEra: 'CE',
    })
  })
})

describe('mapTimeline', () => {
  const baseTimeline: SqliteTimelineRow = {
    id: 'l1',
    title: 'Всеобщая история',
    description: '',
    viewport_start: 139.34,
    viewport_end: 1618.57,
    filter_type_ids_json: '["t1","t2"]',
    epochs_visible: 1,
    show_all: 1,
  }

  it('parses the stored filter list into an array', () => {
    expect(mapTimeline(baseTimeline, 'vseobschaya-istoriya').filterTypeIds).toEqual(['t1', 't2'])
  })

  it('reads an empty filter list as an empty array', () => {
    const row = { ...baseTimeline, filter_type_ids_json: '[]' }
    expect(mapTimeline(row, 'x').filterTypeIds).toEqual([])
  })

  it('rejects a filter list that is not an array of strings', () => {
    const row = { ...baseTimeline, filter_type_ids_json: '{"a":1}' }
    expect(() => mapTimeline(row, 'x')).toThrow(/filter_type_ids_json/)
  })

  it('takes the slug from its argument and starts unpublished', () => {
    expect(mapTimeline(baseTimeline, 'vseobschaya-istoriya')).toMatchObject({
      slug: 'vseobschaya-istoriya',
      published: false,
    })
  })

  it('turns both view flags into booleans', () => {
    expect(mapTimeline(baseTimeline, 'x')).toMatchObject({
      epochsVisible: true,
      showAll: true,
    })
  })
})

describe('mapTimelineEpoch', () => {
  it('carries colour, visibility and the pinned lane across', () => {
    expect(mapTimelineEpoch({
      timeline_id: 'l1',
      epoch_id: 'p1',
      local_note_html: '',
      color: '#7463BA',
      visible: 0,
      pinned_lane: 2,
    })).toMatchObject({ color: '#7463BA', visible: false, pinnedLane: 2 })
  })
})

describe('mapEventType', () => {
  it('carries colour and icon across unchanged', () => {
    expect(mapEventType({ id: 't1', title: 'Книга', color: '#D97706', icon: '📖' }))
      .toMatchObject({ id: 't1', title: 'Книга', color: '#D97706', icon: '📖' })
  })
})
