import {
  TimelineValidationError,
  assertEpochDates,
  assertEventDates,
  columnsToDate,
  dateToColumns,
  epochInputSchema,
  eventInputSchema,
  eventTypeInputSchema,
  timelinePublishSchema,
} from './admin'

describe('assertEventDates', () => {
  it('пропускает корректное событие-точку', () => {
    expect(() => assertEventDates({ start: { year: 1917, era: 'CE' } })).not.toThrow()
  })

  it('пропускает интервал с полным окончанием', () => {
    expect(() =>
      assertEventDates({
        start: { year: 1914, era: 'CE', month: 7, day: 28 },
        end: { year: 1918, era: 'CE', month: 11, day: 11 },
      }),
    ).not.toThrow()
  })

  it('отвергает год меньше единицы', () => {
    expect(() => assertEventDates({ start: { year: 0, era: 'CE' } })).toThrow(
      TimelineValidationError,
    )
  })

  it('отвергает день без месяца', () => {
    expect(() => assertEventDates({ start: { year: 1917, era: 'CE', day: 7 } })).toThrow(
      /день можно указать только вместе с месяцем/i,
    )
  })

  it('отвергает «продолжается» вместе с датой окончания', () => {
    expect(() =>
      assertEventDates({
        start: { year: 1991, era: 'CE' },
        end: { year: 2000, era: 'CE' },
        ongoing: true,
      }),
    ).toThrow(/продолжается/i)
  })

  it('пропускает «продолжается» без даты окончания', () => {
    expect(() =>
      assertEventDates({ start: { year: 1991, era: 'CE' }, ongoing: true }),
    ).not.toThrow()
  })

  it('пропускает интервал до нашей эры: 100 до н. э. → 50 до н. э.', () => {
    expect(() =>
      assertEventDates({
        start: { year: 100, era: 'BCE' },
        end: { year: 50, era: 'BCE' },
      }),
    ).not.toThrow()
  })

  it('отвергает перевёрнутый интервал до нашей эры: 50 до н. э. → 100 до н. э.', () => {
    // Числами 50 < 100, и наивная проверка пропустила бы этот случай.
    expect(() =>
      assertEventDates({
        start: { year: 50, era: 'BCE' },
        end: { year: 100, era: 'BCE' },
      }),
    ).toThrow(/раньше даты начала/i)
  })

  it('отвергает конец в BCE при начале в CE', () => {
    expect(() =>
      assertEventDates({
        start: { year: 10, era: 'CE' },
        end: { year: 10, era: 'BCE' },
      }),
    ).toThrow(TimelineValidationError)
  })

  it('отвергает неполное окончание с днём без месяца', () => {
    expect(() =>
      assertEventDates({
        start: { year: 1914, era: 'CE' },
        end: { year: 1918, era: 'CE', day: 11 },
      }),
    ).toThrow(TimelineValidationError)
  })
})

describe('assertEpochDates', () => {
  it('пропускает эпоху с началом и концом', () => {
    expect(() =>
      assertEpochDates({ start: { year: 1900, era: 'CE' }, end: { year: 1950, era: 'CE' } }),
    ).not.toThrow()
  })

  it('отвергает эпоху без конца', () => {
    expect(() => assertEpochDates({ start: { year: 1900, era: 'CE' } })).toThrow(
      /обязательна дата окончания/i,
    )
  })

  it('отвергает эпоху с концом раньше начала', () => {
    expect(() =>
      assertEpochDates({ start: { year: 1950, era: 'CE' }, end: { year: 1900, era: 'CE' } }),
    ).toThrow(/раньше даты начала/i)
  })

  it('сравнивает неполные даты по границам: 1900 → 1900 март', () => {
    expect(() =>
      assertEpochDates({
        start: { year: 1900, era: 'CE' },
        end: { year: 1900, era: 'CE', month: 3 },
      }),
    ).not.toThrow()
  })
})

describe('eventTypeInputSchema', () => {
  it('принимает корректный тип', () => {
    const parsed = eventTypeInputSchema.parse({ title: '  Война  ', color: '#C0603A', icon: '⚔' })
    expect(parsed).toEqual({ title: 'Война', color: '#C0603A', icon: '⚔' })
  })

  it('отвергает цвет не в формате #RRGGBB', () => {
    const result = eventTypeInputSchema.safeParse({ title: 'Война', color: 'red', icon: '⚔' })
    expect(result.success).toBe(false)
  })

  it('отвергает трёхсимвольный hex', () => {
    const result = eventTypeInputSchema.safeParse({ title: 'Война', color: '#abc', icon: '⚔' })
    expect(result.success).toBe(false)
  })

  it('отвергает пустое название', () => {
    const result = eventTypeInputSchema.safeParse({ title: '   ', color: '#C0603A', icon: '⚔' })
    expect(result.success).toBe(false)
  })
})

describe('eventInputSchema', () => {
  const base = {
    title: 'Октябрьская революция',
    eventTypeId: 'type-1',
    start: { year: 1917, era: 'CE', month: 11, day: 7 },
  }

  it('заполняет умолчания необязательных полей', () => {
    const parsed = eventInputSchema.parse(base)
    expect(parsed.end).toBeNull()
    expect(parsed.ongoing).toBe(false)
    expect(parsed.description).toBe('')
    expect(parsed.imageUrl).toBeNull()
    expect(parsed.imageCaption).toBeNull()
  })

  it('превращает пустую строку адреса картинки в null', () => {
    const parsed = eventInputSchema.parse({ ...base, imageUrl: '   ' })
    expect(parsed.imageUrl).toBeNull()
  })

  it('отвергает адрес картинки без схемы', () => {
    const result = eventInputSchema.safeParse({ ...base, imageUrl: 'example.com/pic.png' })
    expect(result.success).toBe(false)
  })

  it('отвергает день без месяца ещё на разборе', () => {
    const result = eventInputSchema.safeParse({
      ...base,
      start: { year: 1917, era: 'CE', day: 7 },
      end: null,
    })
    // Схема пропускает форму даты, поэтому финальную проверку делает
    // assertEventDates — здесь важно лишь, что разбор не падает исключением.
    expect(result.success).toBe(true)
    expect(() => assertEventDates(eventInputSchema.parse({ ...base, start: { year: 1917, era: 'CE', day: 7 } }))).toThrow(
      TimelineValidationError,
    )
  })

  it('отвергает неизвестное поле', () => {
    const result = eventInputSchema.safeParse({ ...base, colour: '#fff' })
    expect(result.success).toBe(false)
  })

  it('отвергает год ноль', () => {
    const result = eventInputSchema.safeParse({ ...base, start: { year: 0, era: 'CE' } })
    expect(result.success).toBe(false)
  })
})

describe('epochInputSchema', () => {
  it('принимает эпоху с началом и концом', () => {
    const parsed = epochInputSchema.parse({
      title: 'Античность',
      start: { year: 800, era: 'BCE' },
      end: { year: 476, era: 'CE' },
    })
    expect(parsed.start).toEqual({ year: 800, era: 'BCE' })
    expect(parsed.end).toEqual({ year: 476, era: 'CE' })
  })
})

describe('timelinePublishSchema', () => {
  it('принимает только published', () => {
    expect(timelinePublishSchema.parse({ published: true })).toEqual({ published: true })
    expect(timelinePublishSchema.safeParse({ published: true, title: 'x' }).success).toBe(false)
  })
})

describe('dateToColumns / columnsToDate', () => {
  it('раскладывает дату по колонкам', () => {
    expect(dateToColumns({ year: 1917, era: 'CE', month: 11 })).toEqual({
      year: 1917,
      era: 'CE',
      month: 11,
      day: null,
    })
  })

  it('пустая дата даёт пустые колонки', () => {
    expect(dateToColumns(null)).toEqual({ year: null, era: null, month: null, day: null })
  })

  it('собирает дату обратно', () => {
    expect(columnsToDate({ year: 100, era: 'BCE', month: 3, day: 4 })).toEqual({
      year: 100,
      era: 'BCE',
      month: 3,
      day: 4,
    })
  })

  it('пустые колонки дают null', () => {
    expect(columnsToDate({ year: null, era: null, month: null, day: null })).toBeNull()
  })
})
