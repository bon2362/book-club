const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y',
  ь: '', э: 'e', ю: 'yu', я: 'ya',
}

export function slugifyTitle(title: string, fallback = 'krug'): string {
  const transliterated = title.toLowerCase().split('')
    .map((char) => (char in TRANSLIT ? TRANSLIT[char] : char))
    .join('')
  const slug = transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug || fallback
}

export function uniqueSlug(
  base: string,
  taken: ReadonlySet<string>,
  reserved: ReadonlySet<string> = new Set(),
): string {
  let candidate = base
  let suffix = 1
  while (taken.has(candidate) || reserved.has(candidate)) {
    suffix += 1
    candidate = `${base}-${suffix}`
  }
  return candidate
}
