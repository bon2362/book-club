/**
 * Цвета типов событий и эпох приходят из базы — это значения, а не литералы в
 * коде, и подставлять их в `style` можно. Но пришедшее из данных значение
 * проверяется: всё, что не выглядит как цвет, заменяется токеном, чтобы в
 * разметку не попала произвольная строка.
 */

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export const FALLBACK_DATA_COLOR = 'var(--text-secondary)'

export function normalizeDataColor(value: string | null | undefined): string {
  if (typeof value !== 'string') return FALLBACK_DATA_COLOR
  const trimmed = value.trim()
  return HEX_COLOR.test(trimmed) ? trimmed : FALLBACK_DATA_COLOR
}

const EPOCH_TINTS = TIMELINE_EPOCH_PALETTE.map(({ value }) => value)

/**
 * Старые эпохи хранят насыщенные цвета. На публичном полотне каждый такой
 * цвет стабильно проецируется на утверждённую палитру светлых заливок.
 */
export function normalizeEpochColor(value: string | null | undefined): string {
  const normalized = normalizeDataColor(value)
  if (normalized === FALLBACK_DATA_COLOR) return EPOCH_TINTS[0]

  const approvedTint = EPOCH_TINTS.find((tint) => tint.toLowerCase() === normalized.toLowerCase())
  if (approvedTint !== undefined) return approvedTint

  let hash = 0
  for (const character of normalized.toLowerCase()) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }

  return EPOCH_TINTS[hash % EPOCH_TINTS.length]
}
import { TIMELINE_EPOCH_PALETTE } from './admin/palette'
