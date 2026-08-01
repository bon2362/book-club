/**
 * Геометрия полотна событий: высота и сторона подписи.
 * Вынесено из `TimelineEventLayer`, чтобы поведение можно было проверить
 * тестом — оба правила ниже возникли из видимых дефектов вёрстки.
 */

export const EVENT_LANE_PITCH_PX = 44
export const EVENT_LANE_BASE_PX = 10
export const EVENT_LANE_TOP_RESERVE_PX = 6
export const MARKER_ROW_HEIGHT_PX = 20

export const eventBottom = (lane: number, pitch = EVENT_LANE_PITCH_PX): number =>
  EVENT_LANE_BASE_PX + lane * pitch

export interface LaneOccupant {
  lane: number
  /** Левая граница элемента в пикселях полотна. */
  start: number
  /** Правая граница элемента в пикселях полотна. */
  end: number
}

/**
 * Считает дорожки, занятые элементами, которые действительно попадают на
 * полотно.
 *
 * Раскладка намеренно считается с запасом за краями экрана: иначе номер
 * дорожки менялся бы при прокрутке и события прыгали бы. Но высоту полотна
 * от этого запаса брать нельзя — события за правым краем обрезаются, и
 * полотно вырастало до потолка с пустотой сверху.
 */
export function occupiedLaneCount(items: LaneOccupant[], width: number): number {
  const visible = items.filter((item) => item.end >= 0 && item.start <= width)
  if (visible.length === 0) return 0
  return Math.max(...visible.map((item) => item.lane)) + 1
}

/** Сколько дорожек помещается в фактически измеренную CSS-высоту полотна. */
export function eventLaneCapacity(height: number): number {
  return Math.max(
    1,
    Math.floor((height - EVENT_LANE_BASE_PX - EVENT_LANE_TOP_RESERVE_PX) / EVENT_LANE_PITCH_PX),
  )
}

/** Раскрывает занятые дорожки по свободной высоте, не сжимая и не разрежая их чрезмерно. */
export function eventLanePitch(height: number, laneCount: number): number {
  const availablePitch = (height - EVENT_LANE_BASE_PX - 22) / Math.max(laneCount, 1)
  return Math.min(
    EVENT_LANE_PITCH_PX * 1.8,
    Math.max(EVENT_LANE_PITCH_PX, availablePitch),
  )
}

/**
 * Сколько места остаётся подписи до правого края полотна.
 *
 * Подпись всегда растёт вправо от метки — так же, как её считает раскладка по
 * дорожкам. Разворачивать ряд влево у края нельзя: раскладка резервирует место
 * справа, и развёрнутая подпись наезжала бы на соседей. Поэтому у края подпись
 * не переносится, а ужимается многоточием; полный текст остаётся в подсказке.
 *
 * `chrome` — то, что занято в ряду помимо самого текста: метка, отступы и дата.
 */
export function labelMaxWidth(x: number, width: number, chrome: number): number {
  return Math.max(0, width - x - chrome)
}
