const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y',
  ь: '', э: 'e', ю: 'yu', я: 'ya',
}

const FALLBACK_SLUG = 'krug'

export function slugifyTitle(title: string): string {
  const transliterated = title.toLowerCase().split('')
    .map((char) => (char in TRANSLIT ? TRANSLIT[char] : char))
    .join('')

  const slug = transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return slug || FALLBACK_SLUG
}

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
