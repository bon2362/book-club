import { z } from 'zod'
import { TimelineValidationError } from './admin'
import type { HistoricalDate } from './historical-date'
import { validatePinnedEpochLane, type EpochLaneInput } from './geometry/epoch-lanes'

/**
 * Проверки состава ленты: сама лента (название, адрес, описание) и связи с
 * событиями и эпохами.
 *
 * Занятость закреплённой дорожки эпохи здесь **не считается заново** — она
 * берётся из `validatePinnedEpochLane` расчётного ядра. Правило там неочевидно
 * (пересечение ровно в один календарный год допустимо, в два — уже нет) и
 * выверено тестами `calendar-year-overlap`; вторая реализация разошлась бы с
 * тем, что рисует публичная лента.
 */

/** Адрес ленты: строчная латиница, цифры и одиночные дефисы между ними. */
export const TIMELINE_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

const slugSchema = z
  .string()
  .trim()
  .min(1, 'Адрес обязателен')
  .max(120, 'Адрес не длиннее 120 символов')
  .regex(
    TIMELINE_SLUG_PATTERN,
    'Адрес — строчные латинские буквы, цифры и дефис между ними: moya-lenta',
  )

const titleSchema = z
  .string()
  .trim()
  .min(1, 'Название обязательно')
  .max(200, 'Название не длиннее 200 символов')

const descriptionSchema = z.string().max(20000, 'Описание не длиннее 20000 символов')

const noteSchema = z
  .string()
  .max(20000, 'Заметка не длиннее 20000 символов')
  .nullish()
  .transform((value) => value ?? '')

const colorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Цвет задаётся семью символами вида #RRGGBB')

const pinnedLaneSchema = z
  .number()
  .int('Дорожка — целое число')
  .min(0, 'Дорожка не может быть отрицательной')
  .nullish()
  .transform((value) => value ?? null)

/** Создание ленты: все три поля обязательны. */
export const timelineInputSchema = z
  .object({
    title: titleSchema,
    slug: slugSchema,
    description: descriptionSchema.nullish().transform((value) => value ?? ''),
  })
  .strict()

/**
 * Правка ленты. Все поля необязательны — кнопка публикации присылает только
 * `published`, форма — название, адрес и описание. Пустое тело отвергается,
 * чтобы не писать в базу вхолостую.
 */
export const timelinePatchSchema = z
  .object({
    title: titleSchema.optional(),
    slug: slugSchema.optional(),
    description: descriptionSchema.optional(),
    published: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Нечего менять')

export const eventMembershipSchema = z.object({ note: noteSchema }).strict()

export const epochMembershipSchema = z
  .object({
    note: noteSchema,
    color: colorSchema,
    visible: z.boolean().nullish().transform((value) => value ?? true),
    pinnedLane: pinnedLaneSchema,
  })
  .strict()

export type TimelineInput = z.infer<typeof timelineInputSchema>
export type TimelinePatch = z.infer<typeof timelinePatchSchema>
export type EventMembershipInput = z.infer<typeof eventMembershipSchema>
export type EpochMembershipInput = z.infer<typeof epochMembershipSchema>

/** Эпоха ленты в том виде, в каком её хватает для проверки дорожек. */
export interface EpochLaneCandidate {
  id: string
  title: string
  start: HistoricalDate
  end: HistoricalDate
  pinnedLane?: number | null
}

function toLaneInput(item: EpochLaneCandidate): EpochLaneInput {
  return {
    id: item.id,
    start: item.start,
    end: item.end,
    pinnedLane: item.pinnedLane as number,
  }
}

/**
 * Занята ли закреплённая дорожка кем-то ещё на этой же ленте.
 *
 * Незакреплённая эпоха (`pinnedLane` пуст) проверки не требует: раскладка
 * найдёт ей свободную дорожку сама. Сравниваются только закреплённые — иначе
 * `validatePinnedEpochLane` посчитала бы совпадением два пустых значения.
 */
export function assertEpochLaneFree(
  candidate: EpochLaneCandidate,
  existing: EpochLaneCandidate[],
): void {
  if (candidate.pinnedLane == null) return

  const pinned = existing.filter((item) => item.id !== candidate.id && item.pinnedLane != null)
  const result = validatePinnedEpochLane(toLaneInput(candidate), pinned.map(toLaneInput))
  if (result.valid) return

  const conflict = pinned.find((item) => item.id === result.conflictingEpochId)
  throw new TimelineValidationError(
    `Дорожка ${candidate.pinnedLane} занята эпохой «${conflict?.title ?? result.conflictingEpochId}»`,
  )
}
