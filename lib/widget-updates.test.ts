/**
 * @jest-environment node
 */
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))

import { db } from '@/lib/db'
import {
  FEEDBACK_PREVIEW_LENGTH,
  WIDGET_DEFAULT_LOOKBACK_MS,
  WIDGET_ITEMS_LIMIT,
  WIDGET_MAX_LOOKBACK_MS,
  WIDGET_SCAN_LIMIT,
  clampSince,
  getWidgetUpdates,
  preview,
  toCategory,
} from './widget-updates'

// Цепочка drizzle: любые from/join/where/orderBy/limit возвращают саму цепочку,
// await отдаёт заранее заданные строки.
function chain(rows: unknown[]) {
  const c: Record<string, unknown> = {}
  for (const m of ['from', 'innerJoin', 'leftJoin', 'where', 'orderBy', 'limit']) c[m] = jest.fn(() => c)
  c.then = (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve(rows).then(resolve, reject)
  return c
}

const now = new Date('2026-09-15T12:00:00Z')

describe('clampSince', () => {
  it('без параметра берёт неделю назад', () => {
    expect(clampSince(null, now).getTime()).toBe(now.getTime() - WIDGET_DEFAULT_LOOKBACK_MS)
  })

  it('мусор трактует как отсутствие параметра', () => {
    expect(clampSince('not-a-date', now).getTime()).toBe(now.getTime() - WIDGET_DEFAULT_LOOKBACK_MS)
  })

  it('пропускает корректное время как есть', () => {
    expect(clampSince('2026-09-14T08:00:00Z', now).toISOString()).toBe('2026-09-14T08:00:00.000Z')
  })

  it('не глубже 30 дней и не в будущем', () => {
    expect(clampSince('2020-01-01T00:00:00Z', now).getTime()).toBe(now.getTime() - WIDGET_MAX_LOOKBACK_MS)
    expect(clampSince('2030-01-01T00:00:00Z', now).getTime()).toBe(now.getTime())
  })
})

describe('preview', () => {
  it('схлопывает пробелы и переносы', () => {
    expect(preview('  привет\n\n  мир  ')).toBe('привет мир')
  })

  it('обрезает длинный текст с многоточием', () => {
    const result = preview('а'.repeat(200))
    expect(result).toHaveLength(FEEDBACK_PREVIEW_LENGTH)
    expect(result.endsWith('…')).toBe(true)
  })
})

describe('toCategory', () => {
  const item = (i: number) => ({ id: `id${i}`, title: `t${i}`, subtitle: null, at: '' })

  it('считает все строки, но отдаёт только первые', () => {
    const cat = toCategory(Array.from({ length: 8 }, (_, i) => item(i)))
    expect(cat.count).toBe(8)
    expect(cat.capped).toBe(false)
    expect(cat.items.map(i => i.id)).toEqual(Array.from({ length: WIDGET_ITEMS_LIMIT }, (_, i) => `id${i}`))
  })

  it('помечает упор в лимит сканирования', () => {
    expect(toCategory(Array.from({ length: WIDGET_SCAN_LIMIT }, (_, i) => item(i))).capped).toBe(true)
  })
})

describe('getWidgetUpdates', () => {
  const mockSelect = db.select as jest.Mock
  const since = new Date('2026-09-14T00:00:00Z')
  const at = new Date('2026-09-15T10:00:00Z')

  beforeEach(() => mockSelect.mockReset())

  // Порядок вызовов db.select совпадает с порядком в Promise.all;
  // участники матчинга запрашиваются последними, после поиска сессии.
  function queue(opts: { session: unknown[]; participants?: unknown[] }) {
    mockSelect
      .mockReturnValueOnce(chain([{ id: 'u1', name: null, at }]))
      .mockReturnValueOnce(chain([{ id: 's1', title: 'Капитал', author: 'Маркс', at }]))
      .mockReturnValueOnce(chain([{ id: 'sm1', bookTitle: 'Капитал', author: 'Анна', at }]))
      .mockReturnValueOnce(chain([{ id: 'c1', title: 'Подборка', author: '', at }]))
      .mockReturnValueOnce(chain([
        { id: 'f1', name: null, userName: 'Борис', message: 'Спасибо\nза сайт', at },
        { id: 'f2', name: null, userName: null, message: 'x', at },
      ]))
      .mockReturnValueOnce(chain(opts.session))
      .mockReturnValueOnce(chain(opts.participants ?? []))
  }

  it('собирает все категории и подставляет запасные подписи', async () => {
    queue({ session: [{ id: 'ms1', name: 'Осень' }], participants: [{ id: 'u2', name: 'Вера', at }] })

    const result = await getWidgetUpdates(since, now)

    expect(result.since).toBe(since.toISOString())
    expect(result.generatedAt).toBe(now.toISOString())
    expect(result.users.items[0]).toEqual({ id: 'u1', title: 'Без имени', subtitle: null, at: at.toISOString() })
    expect(result.submissions.items[0]).toMatchObject({ title: 'Капитал', subtitle: 'Маркс' })
    expect(result.summaries.items[0]).toMatchObject({ title: 'Капитал', subtitle: 'Анна' })
    expect(result.collections.items[0]).toMatchObject({ title: 'Подборка', subtitle: null })
    expect(result.feedback.items.map(i => [i.title, i.subtitle])).toEqual([
      ['Борис', 'Спасибо за сайт'],
      ['Аноним', 'x'],
    ])
    expect(result.feedback.count).toBe(2)
    expect(result.matchingSession).toEqual({ id: 'ms1', name: 'Осень' })
    expect(result.matching.items[0]).toMatchObject({ id: 'u2', title: 'Вера' })
  })

  it('без открытой сессии матчинга не запрашивает участников', async () => {
    queue({ session: [] })

    const result = await getWidgetUpdates(since, now)

    expect(result.matchingSession).toBeNull()
    expect(result.matching).toEqual({ count: 0, capped: false, items: [] })
    expect(mockSelect).toHaveBeenCalledTimes(6)
  })
})
