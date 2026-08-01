/**
 * @jest-environment node
 */

// Очередь ответов «базы»: терминальные методы запроса разбирают её по порядку.
const queue: unknown[][] = []
const whereArgs: unknown[] = []

function pullResult(): Promise<unknown[]> {
  return Promise.resolve(queue.length > 0 ? queue.shift()! : [])
}

jest.mock('@/lib/db', () => {
  function buildChain() {
    const chain = {
      from: jest.fn(() => chain),
      leftJoin: jest.fn(() => chain),
      innerJoin: jest.fn(() => chain),
      where: jest.fn((condition: unknown) => {
        whereArgs.push(condition)
        return chain
      }),
      groupBy: jest.fn(() => chain),
      orderBy: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      then: <T,>(onFulfilled: (value: unknown) => T) => pullResult().then(onFulfilled),
      catch: <T,>(onRejected: (reason: unknown) => T) => pullResult().catch(onRejected),
    } as unknown as Record<string, jest.Mock>
    return chain
  }
  return { db: { select: jest.fn(() => buildChain()) } }
})

import { fetchPublishedTimelines, fetchTimelineBySlug, fetchTimelineSummaries } from './queries'

/**
 * Собирает имена колонок, упомянутых в условии drizzle. Обходятся только
 * `queryChunks` самого условия: спускаться в `table` колонки нельзя — там
 * перечислены вообще все колонки таблицы, и проверка потеряла бы смысл.
 */
function columnNames(condition: unknown): string[] {
  const names: string[] = []
  const walk = (node: unknown) => {
    if (node === null || typeof node !== 'object') return
    const record = node as Record<string, unknown>
    if (typeof record.name === 'string' && typeof record.columnType === 'string') {
      names.push(record.name)
      return
    }
    const chunks = record.queryChunks
    if (Array.isArray(chunks)) chunks.forEach(walk)
  }
  walk(condition)
  return names
}

beforeEach(() => {
  queue.length = 0
  whereArgs.length = 0
})

describe('fetchTimelineSummaries', () => {
  it('по умолчанию фильтрует по published', async () => {
    queue.push([{ id: 'tl-1', slug: 'a', title: 'A', description: '', published: true, eventCount: 3 }])

    const summaries = await fetchPublishedTimelines()

    expect(summaries).toHaveLength(1)
    expect(whereArgs).toHaveLength(1)
    expect(columnNames(whereArgs[0])).toContain('published')
  })

  it('с includeUnpublished условие по published не добавляет', async () => {
    queue.push([])

    await fetchTimelineSummaries({ includeUnpublished: true })

    expect(whereArgs).toHaveLength(0)
  })
})

describe('fetchTimelineBySlug', () => {
  const timelineRow = {
    id: 'tl-1',
    slug: 'istoriya',
    title: 'История',
    description: '',
    published: true,
    viewportStart: null,
    viewportEnd: null,
    filterTypeIds: [],
    epochsVisible: true,
    showAll: false,
  }

  it('ищет по slug и не фильтрует по published — решение принимает страница', async () => {
    queue.push([
      {
        id: 'tl-1',
        slug: 'istoriya',
        title: 'История',
        description: '',
        published: false,
        viewportStart: null,
        viewportEnd: null,
        filterTypeIds: [],
        epochsVisible: true,
        showAll: false,
      },
    ])
    queue.push([])
    queue.push([])

    const view = await fetchTimelineBySlug('istoriya')

    expect(view).toMatchObject({ slug: 'istoriya', published: false, events: [], epochs: [] })
    const names = whereArgs.flatMap(columnNames)
    expect(names).toContain('slug')
    expect(names).not.toContain('published')
  })

  it('возвращает null, если таймлайна нет', async () => {
    queue.push([])

    expect(await fetchTimelineBySlug('нет-такого')).toBeNull()
  })

  it('без includeLibrary не запрашивает и не возвращает непривязанные элементы', async () => {
    queue.push([timelineRow])
    queue.push([])
    queue.push([])
    queue.push([{ id: 'unattached', title: 'Не в этой ленте' }])

    const view = await fetchTimelineBySlug('istoriya')

    expect(view).toMatchObject({ libraryEvents: [], libraryEpochs: [] })
    expect(queue).toHaveLength(1)
  })

  it('с includeLibrary возвращает только непривязанные элементы общей базы', async () => {
    const attachedEvent = {
      id: 'event-attached',
      title: 'В ленте',
      typeId: 'type-1',
      typeTitle: 'Событие',
      color: '#5D7290',
      icon: '',
      startYear: 1900,
      startEra: 'CE',
      startMonth: null,
      startDay: null,
      endYear: null,
      endEra: null,
      endMonth: null,
      endDay: null,
      ongoing: false,
      description: '',
      imageUrl: null,
      imageCaption: null,
    }
    const attachedEpoch = {
      id: 'epoch-attached',
      title: 'В ленте',
      startYear: 1900,
      startEra: 'CE',
      startMonth: null,
      startDay: null,
      endYear: 1950,
      endEra: 'CE',
      endMonth: null,
      endDay: null,
      description: '',
      imageUrl: null,
      imageCaption: null,
    }

    queue.push([timelineRow])
    queue.push([{ ...attachedEvent, note: '', visible: true }])
    queue.push([{ ...attachedEpoch, note: '', color: '#EFE4D6', visible: true, pinnedLane: null }])
    queue.push([attachedEvent, { ...attachedEvent, id: 'event-library', title: 'Только в базе' }])
    queue.push([attachedEpoch, { ...attachedEpoch, id: 'epoch-library', title: 'Только в базе' }])

    const view = await fetchTimelineBySlug('istoriya', { includeLibrary: true })

    expect(view?.libraryEvents.map(({ id }) => id)).toEqual(['event-library'])
    expect(view?.libraryEpochs.map(({ id }) => id)).toEqual(['epoch-library'])
  })

  it('склеивает событие с типом, а эпоху — с цветом связи', async () => {
    queue.push([
      {
        id: 'tl-1',
        slug: 'istoriya',
        title: 'История',
        description: '',
        published: true,
        viewportStart: null,
        viewportEnd: null,
        filterTypeIds: [],
        epochsVisible: true,
        showAll: false,
      },
    ])
    queue.push([
      {
        id: 'ev-1',
        title: 'Событие',
        typeId: 'type-1',
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
        description: '',
        imageUrl: null,
        imageCaption: null,
        note: 'заметка',
        visible: true,
      },
    ])
    queue.push([
      {
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
      },
    ])

    const view = await fetchTimelineBySlug('istoriya')

    expect(view?.events[0]).toMatchObject({ typeTitle: 'Война', color: '#C0603A', note: 'заметка' })
    expect(view?.epochs[0]).toMatchObject({ title: 'Античность', color: '#2D6A4F' })
  })
})
