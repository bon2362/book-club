import Fuse from 'fuse.js'
import { transliterate } from 'transliteration'
import type { Book } from './sheets'

function toTranslit(text: string): string {
  return transliterate(text)
}

function buildSearchIndex(books: Book[]) {
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

export function searchBooks(books: Book[], query: string): Book[] {
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
    .filter((b): b is Book => b !== undefined)
}
