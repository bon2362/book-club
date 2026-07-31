/**
 * Геометрия полотна событий: высота и сторона подписи.
 * Вынесено из `TimelineEventLayer`, чтобы поведение можно было проверить
 * тестом — оба правила ниже возникли из видимых дефектов вёрстки.
 */

export const EVENT_LANE_PITCH_PX = 46
export const EVENT_LANE_BASE_PX = 16
/** Предел высоты полотна: сколько дорожек раскладка вообще может занять. */
export const EVENT_AREA_HEIGHT_PX = 380
/** Ниже этой высоты полотно не сжимается, даже если событий одна дорожка. */
export const EVENT_AREA_MIN_HEIGHT_PX = 120
export const MARKER_ROW_HEIGHT_PX = 20

export const eventBottom = (lane: number): number =>
  EVENT_LANE_BASE_PX + lane * EVENT_LANE_PITCH_PX

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

export function eventAreaHeight(laneCount: number): number {
  return Math.min(
    EVENT_AREA_HEIGHT_PX,
    Math.max(EVENT_AREA_MIN_HEIGHT_PX, eventBottom(laneCount) + MARKER_ROW_HEIGHT_PX),
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
