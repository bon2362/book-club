import {
  assertEpochLaneFree,
  epochMembershipSchema,
  eventMembershipSchema,
  timelineInputSchema,
  timelinePatchSchema,
  type EpochLaneCandidate,
} from './contents'
import { TimelineValidationError } from './admin'

describe('timelineInputSchema', () => {
  it('принимает корректный адрес', () => {
    const parsed = timelineInputSchema.parse({
      title: 'Моя лента',
      slug: 'moya-lenta',
      description: null,
    })
    expect(parsed).toEqual({ title: 'Моя лента', slug: 'moya-lenta', description: '' })
  })

  it.each(['Моя Лента', 'moya_lenta', '-abc', 'abc-', 'moya--lenta', ''])(
    'отвергает адрес %p',
    (slug) => {
      const result = timelineInputSchema.safeParse({ title: 'Лента', slug, description: '' })
      expect(result.success).toBe(false)
    },
  )

  it('отвергает посторонние поля', () => {
    const result = timelineInputSchema.safeParse({
      title: 'Лента',
      slug: 'lenta',
      description: '',
      published: true,
    })
    expect(result.success).toBe(false)
  })
})

describe('timelinePatchSchema', () => {
  it('принимает только published', () => {
    expect(timelinePatchSchema.parse({ published: false })).toEqual({ published: false })
  })

  it('принимает название вместе с адресом', () => {
    expect(timelinePatchSchema.parse({ title: 'Новое', slug: 'novoe' })).toEqual({
      title: 'Новое',
      slug: 'novoe',
    })
  })

  it('отвергает пустое тело и посторонние поля', () => {
    expect(timelinePatchSchema.safeParse({}).success).toBe(false)
    expect(timelinePatchSchema.safeParse({ published: true, lane: 1 }).success).toBe(false)
  })
})

describe('eventMembershipSchema', () => {
  it('пустое тело даёт пустую заметку', () => {
    expect(eventMembershipSchema.parse({})).toEqual({ note: '' })
  })

  it('сохраняет заметку', () => {
    expect(eventMembershipSchema.parse({ note: '**важно**' })).toEqual({ note: '**важно**' })
  })
})

describe('epochMembershipSchema', () => {
  const base = { color: '#7463BA', visible: true }

  it('принимает семизначный цвет', () => {
    expect(epochMembershipSchema.parse(base)).toEqual({
      note: '',
      color: '#7463BA',
      visible: true,
      pinnedLane: null,
    })
  })

  it.each(['7463BA', '#74', '#7463B', 'var(--accent)'])('отвергает цвет %p', (color) => {
    expect(epochMembershipSchema.safeParse({ ...base, color }).success).toBe(false)
  })

  it('отвергает отрицательную дорожку и принимает нулевую', () => {
    expect(epochMembershipSchema.safeParse({ ...base, pinnedLane: -1 }).success).toBe(false)
    expect(epochMembershipSchema.parse({ ...base, pinnedLane: 0 }).pinnedLane).toBe(0)
  })

  it('отвергает дробную дорожку', () => {
    expect(epochMembershipSchema.safeParse({ ...base, pinnedLane: 1.5 }).success).toBe(false)
  })
})

describe('assertEpochLaneFree', () => {
  function epoch(
    id: string,
    title: string,
    startYear: number,
    endYear: number,
    pinnedLane: number | null,
  ): EpochLaneCandidate {
    return {
      id,
      title,
      start: { year: startYear, era: 'CE' },
      end: { year: endYear, era: 'CE' },
      pinnedLane,
    }
  }

  it('пересечение в два календарных года на одной дорожке запрещено', () => {
    const candidate = epoch('new', 'Новая', 1949, 1980, 1)
    const existing = [epoch('old', 'Средневековье', 1900, 1950, 1)]

    expect(() => assertEpochLaneFree(candidate, existing)).toThrow(TimelineValidationError)
    expect(() => assertEpochLaneFree(candidate, existing)).toThrow(/Средневековье/)
  })

  it('пересечение ровно в один календарный год допустимо', () => {
    const candidate = epoch('new', 'Новая', 1950, 1980, 1)
    const existing = [epoch('old', 'Средневековье', 1900, 1950, 1)]

    expect(() => assertEpochLaneFree(candidate, existing)).not.toThrow()
  })

  it('соседняя дорожка не мешает', () => {
    const candidate = epoch('new', 'Новая', 1900, 1950, 2)
    const existing = [epoch('old', 'Средневековье', 1900, 1950, 1)]

    expect(() => assertEpochLaneFree(candidate, existing)).not.toThrow()
  })

  it('незакреплённая эпоха не проверяется', () => {
    const candidate = epoch('new', 'Новая', 1900, 1950, null)
    const existing = [epoch('old', 'Средневековье', 1900, 1950, null)]

    expect(() => assertEpochLaneFree(candidate, existing)).not.toThrow()
  })

  it('повторное сохранение той же эпохи не считает её своим конфликтом', () => {
    const candidate = epoch('same', 'Та же', 1900, 1950, 1)
    const existing = [epoch('same', 'Та же', 1900, 1950, 1)]

    expect(() => assertEpochLaneFree(candidate, existing)).not.toThrow()
  })

  it('эры учитываются: 50 до н. э. раньше 10 до н. э.', () => {
    const candidate: EpochLaneCandidate = {
      id: 'new',
      title: 'Поздняя республика',
      start: { year: 50, era: 'BCE' },
      end: { year: 10, era: 'BCE' },
      pinnedLane: 0,
    }
    const existing: EpochLaneCandidate[] = [
      {
        id: 'old',
        title: 'Ранняя республика',
        start: { year: 200, era: 'BCE' },
        end: { year: 40, era: 'BCE' },
        pinnedLane: 0,
      },
    ]

    expect(() => assertEpochLaneFree(candidate, existing)).toThrow(/Ранняя республика/)
  })
})
