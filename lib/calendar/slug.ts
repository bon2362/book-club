import { slugifyTitle } from '@/lib/slug'

export { slugifyTitle }

export function buildSlug(title: string, position: number, taken: ReadonlySet<string>): string {
  const base = slugifyTitle(title)
  let suffix = position <= 1 ? 1 : position
  let candidate = suffix <= 1 ? base : `${base}-${suffix}`
  while (taken.has(candidate)) {
    suffix += 1
    candidate = `${base}-${suffix}`
  }
  return candidate
}
