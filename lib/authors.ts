type BookWithAuthor = { author?: string | null }

function normalizeAuthor(author: string): string {
  return author.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru-RU')
}

export function splitAuthors(author: string | null | undefined): string[] {
  if (!author) return []

  const authorsByKey = new Map<string, string>()
  author
    .split(/\s*(?:,|&|\s+и\s+)\s*/)
    .map(part => part.trim())
    .filter(Boolean)
    .forEach(part => {
      const key = normalizeAuthor(part)
      if (!authorsByKey.has(key)) authorsByKey.set(key, part)
    })

  return Array.from(authorsByKey.values())
}

export function getUniqueAuthors(books: BookWithAuthor[]): string[] {
  const authors = new Map<string, string>()
  books.forEach(book => {
    splitAuthors(book.author).forEach(author => {
      const key = normalizeAuthor(author)
      if (!authors.has(key)) authors.set(key, author)
    })
  })

  return Array.from(authors.values()).sort()
}

export function bookMatchesAuthor(book: BookWithAuthor, author: string): boolean {
  const selectedAuthor = normalizeAuthor(author)
  return splitAuthors(book.author).some(bookAuthor => normalizeAuthor(bookAuthor) === selectedAuthor)
}
