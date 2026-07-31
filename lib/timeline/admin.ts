import { z } from 'zod'
import { compareHistoricalDates, type HistoricalDate } from './historical-date'

/**
 * Проверки данных админки раздела Timeline.
 *
 * Повторяют ограничения, уже стоящие в базе миграцией `0056`. Форма отвергает
 * данные до отправки, маршрут — независимо от формы: иначе Postgres ответит
 * невнятной ошибкой ограничения вместо человеческого текста.
 *
 * Даты сравниваются через `compareHistoricalDates`, а не числами: у дат есть
 * эры (BCE/CE) и неполные значения (год без месяца), поэтому арифметика по
 * году даёт неверный ответ для «до нашей эры».
 */

export class TimelineValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimelineValidationError'
  }
}

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

const colorSchema = z
  .string()
  .trim()
  .regex(COLOR_PATTERN, 'Цвет задаётся семью символами вида #RRGGBB')

const titleSchema = z
  .string()
  .trim()
  .min(1, 'Название обязательно')
  .max(200, 'Название не длиннее 200 символов')

const descriptionSchema = z
  .string()
  .max(20000, 'Описание не длиннее 20000 символов')
  .nullish()
  .transform((value) => value ?? '')

function optionalText(maxLength: number) {
  return z
    .string()
    .trim()
    .max(maxLength, `Не длиннее ${maxLength} символов`)
    .nullish()
    .transform((value) => (value && value.length > 0 ? value : null))
}

const imageUrlSchema = optionalText(2000).refine(
  (value) => value === null || /^(https?:\/\/|\/)/.test(value),
  'Адрес картинки начинается с http://, https:// или /',
)

/** Дата в том виде, в каком её присылает форма: месяц и день могут быть null. */
export const historicalDateInputSchema = z
  .object({
    year: z.number().int('Год — целое число').min(1, 'Год должен быть больше нуля'),
    era: z.enum(['BCE', 'CE']),
    month: z.number().int().min(1, 'Месяц от 1 до 12').max(12, 'Месяц от 1 до 12').nullish(),
    day: z.number().int().min(1, 'День от 1 до 31').max(31, 'День от 1 до 31').nullish(),
  })
  .strict()
  .transform((value): HistoricalDate => {
    const date: HistoricalDate = { year: value.year, era: value.era }
    if (value.month != null) date.month = value.month
    if (value.day != null) date.day = value.day
    return date
  })

export const eventTypeInputSchema = z
  .object({
    title: titleSchema,
    color: colorSchema,
    icon: z.string().trim().min(1, 'Иконка обязательна').max(8, 'Иконка — один-два символа'),
  })
  .strict()

export const eventInputSchema = z
  .object({
    title: titleSchema,
    eventTypeId: z.string().trim().min(1, 'Выберите тип события'),
    start: historicalDateInputSchema,
    end: historicalDateInputSchema.nullish().transform((value) => value ?? null),
    ongoing: z.boolean().nullish().transform((value) => value ?? false),
    description: descriptionSchema,
    imageUrl: imageUrlSchema,
    imageCaption: optionalText(500),
  })
  .strict()

export const epochInputSchema = z
  .object({
    title: titleSchema,
    start: historicalDateInputSchema,
    end: historicalDateInputSchema.nullish().transform((value) => value ?? null),
    description: descriptionSchema,
    imageUrl: imageUrlSchema,
    imageCaption: optionalText(500),
  })
  .strict()

export type EventTypeInput = z.infer<typeof eventTypeInputSchema>
export type EventInput = z.infer<typeof eventInputSchema>
export type EpochInput = z.infer<typeof epochInputSchema>

interface EventDatesInput {
  start: HistoricalDate
  end?: HistoricalDate | null
  ongoing?: boolean | null
}

interface EpochDatesInput {
  start: HistoricalDate
  end?: HistoricalDate | null
}

/**
 * Проверка одной даты: год, эра и правило «день только вместе с месяцем».
 * Оно стоит в базе (`historical_events_start_day_check`), и запрещать его в
 * интерфейсе честнее, чем показывать ошибку после отправки.
 */
function assertDateShape(date: HistoricalDate | null | undefined, label: string): void {
  if (!date) throw new TimelineValidationError(`${label}: дата обязательна`)
  if (!Number.isInteger(date.year) || date.year < 1) {
    throw new TimelineValidationError(`${label}: год должен быть больше нуля`)
  }
  if (date.era !== 'BCE' && date.era !== 'CE') {
    throw new TimelineValidationError(`${label}: эра — «до н. э.» или «н. э.»`)
  }
  if (date.month != null && (date.month < 1 || date.month > 12)) {
    throw new TimelineValidationError(`${label}: месяц от 1 до 12`)
  }
  if (date.day != null && date.month == null) {
    throw new TimelineValidationError(`${label}: день можно указать только вместе с месяцем`)
  }
  if (date.day != null && (date.day < 1 || date.day > 31)) {
    throw new TimelineValidationError(`${label}: день от 1 до 31`)
  }
}

/** Даты события: конец необязателен, но несовместим с признаком «продолжается». */
export function assertEventDates(input: EventDatesInput): void {
  assertDateShape(input.start, 'Начало')

  const end = input.end ?? null

  if (input.ongoing && end) {
    throw new TimelineValidationError(
      'Событие, которое продолжается, не может иметь дату окончания',
    )
  }

  if (!end) return

  assertDateShape(end, 'Окончание')

  if (compareHistoricalDates(input.start, end, 'start', 'end') > 0) {
    throw new TimelineValidationError('Дата окончания не может быть раньше даты начала')
  }
}

/** Даты эпохи: конец обязателен — так стоит в базе (колонки `NOT NULL`). */
export function assertEpochDates(input: EpochDatesInput): void {
  assertDateShape(input.start, 'Начало')

  const end = input.end ?? null
  if (!end) throw new TimelineValidationError('У эпохи обязательна дата окончания')

  assertDateShape(end, 'Окончание')

  if (compareHistoricalDates(input.start, end, 'start', 'end') > 0) {
    throw new TimelineValidationError('Дата окончания не может быть раньше даты начала')
  }
}

/** Первое сообщение из ошибки zod — то, что показывается в форме. */
export function firstZodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Данные не прошли проверку'
}

// --- Преобразование между формой и колонками базы --------------------------

interface DateColumns {
  year: number | null
  era: string | null
  month: number | null
  day: number | null
}

export function dateToColumns(date: HistoricalDate | null): DateColumns {
  if (!date) return { year: null, era: null, month: null, day: null }
  return {
    year: date.year,
    era: date.era,
    month: date.month ?? null,
    day: date.day ?? null,
  }
}

export function columnsToDate(columns: {
  year: number | null
  era: string | null
  month: number | null
  day: number | null
}): HistoricalDate | null {
  if (columns.year == null || columns.era == null) return null
  const date: HistoricalDate = {
    year: columns.year,
    era: columns.era === 'BCE' ? 'BCE' : 'CE',
  }
  if (columns.month != null) date.month = columns.month
  if (columns.day != null) date.day = columns.day
  return date
}

/** Колонки строки события — то, что уходит в insert/update. */
export function eventValues(input: EventInput) {
  const start = dateToColumns(input.start)
  const end = dateToColumns(input.end)
  return {
    title: input.title,
    eventTypeId: input.eventTypeId,
    startYear: start.year as number,
    startEra: start.era as string,
    startMonth: start.month,
    startDay: start.day,
    endYear: end.year,
    endEra: end.era,
    endMonth: end.month,
    endDay: end.day,
    ongoing: input.ongoing,
    description: input.description,
    imageUrl: input.imageUrl,
    imageCaption: input.imageCaption,
  }
}

/** Колонки строки эпохи. Конец обязателен — это проверил `assertEpochDates`. */
export function epochValues(input: EpochInput) {
  const start = dateToColumns(input.start)
  const end = dateToColumns(input.end)
  return {
    title: input.title,
    startYear: start.year as number,
    startEra: start.era as string,
    startMonth: start.month,
    startDay: start.day,
    endYear: end.year as number,
    endEra: end.era as string,
    endMonth: end.month,
    endDay: end.day,
    description: input.description,
    imageUrl: input.imageUrl,
    imageCaption: input.imageCaption,
  }
}

/**
 * Postgres 23505 — нарушение уникального индекса. У типов событий уникально
 * название без учёта регистра, у таймлайнов — адрес.
 */
export function isUniqueViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false
  const code = (error as { code?: unknown }).code
  if (code === '23505') return true
  const cause = (error as { cause?: unknown }).cause
  return cause !== undefined && cause !== error && isUniqueViolation(cause)
}

/** «1 событии» / «2 событиях» — падеж для сообщения об отказе удалить тип. */
export function eventsPlural(count: number): string {
  const mod100 = count % 100
  const mod10 = count % 10
  if (mod100 >= 11 && mod100 <= 14) return 'событиях'
  if (mod10 === 1) return 'событии'
  return 'событиях'
}
