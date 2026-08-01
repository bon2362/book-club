import type { TimelineTextMeasurer } from '@/lib/timeline'

export const EVENT_LABEL_FONT = '13.5px system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
export const EVENT_DATE_FONT = '11.2px ui-monospace, "SF Mono", Menlo, Consolas, monospace'

/** Deterministic conservative fallback used in tests and without canvas. */
export function estimateEventLabelTextWidth(text: string): number {
  return Array.from(text).length * 9.5
}

/** Creates one cached browser text measurer for all timeline labels. */
export function createTextMeasurer(): TimelineTextMeasurer {
  const cache = new Map<string, number>()
  const context = typeof document === 'undefined'
    ? null
    : document.createElement('canvas').getContext('2d')

  return (text, font) => {
    const key = `${font}\u0000${text}`
    const cached = cache.get(key)
    if (cached !== undefined) return cached

    let width = estimateEventLabelTextWidth(text)
    if (context !== null) {
      context.font = font
      width = context.measureText(text).width
    }
    cache.set(key, width)
    return width
  }
}
