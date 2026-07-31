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
