/** В ImageResponse CSS-переменные не работают: значения скопированы из app/globals.css. */
export const OG_COLORS = {
  bg: '#F9F5EE', // --bg
  text: '#111111', // --text
  muted: '#999999', // --text-muted
  accent: '#C0603A', // --accent
  border: '#E5E5E5', // --border
  coverFallback: '#EDE5D8', // --bg-elevated
} as const

// Остальные форматы (webp, avif) ImageResponse не всегда умеет встроить — вместо них инициалы.
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg'])

export async function fetchCoverDataUrl(
  url: string | null,
  timeoutMs = 2500,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  if (!url) return null
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl(url, { signal: controller.signal })
    const type = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    if (!response.ok || !ALLOWED_TYPES.has(type)) return null
    const buffer = Buffer.from(await response.arrayBuffer())
    return `data:${type};base64,${buffer.toString('base64')}`
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function authorInitials(author: string): string {
  return author
    .split(/[\s,]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join('')
}
