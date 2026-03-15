import Fuse from 'fuse.js'
import { transliterate } from 'transliteration'

type Searchable = { id: string; name: string; author: string }

function toTranslit(text: string): string {
  return transliterate(text)
}

function buildSearchIndex<T extends Searchable>(books: T[]) {
  const enriched = books.map(b => ({
    ...b,
    authorTranslit: toTranslit(b.author),
    nameTranslit: toTranslit(b.name),
  }))

  return new Fuse(enriched, {
    keys: ['name', 'author', 'authorTranslit', 'nameTranslit'],
    threshold: 0.4,
    includeScore: true,
  })
}

export function searchBooks<T extends Searchable>(books: T[], query: string): T[] {
  if (!query.trim()) return books

  const fuse = buildSearchIndex(books)
  const queryTranslit = toTranslit(query)

  // Search both the original query and its transliterated form; skip duplicate if identical
  const rawResults = fuse.search(query)
  const translitResults = queryTranslit === query ? [] : fuse.search(queryTranslit)
  const results = [...rawResults, ...translitResults]

  // Deduplicate by id, sort by score
  const seen = new Set<string>()
  return results
    .sort((a, b) => (a.score ?? 1) - (b.score ?? 1))
    .filter(r => {
      if (seen.has(r.item.id)) return false
      seen.add(r.item.id)
      return true
    })
    .map(r => books.find(b => b.id === r.item.id))
    .filter((b): b is T => b !== undefined)
}
