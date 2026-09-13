'use client'

import { useEffect, useState } from 'react'
import type { CollectionBookSearchResult } from '@/lib/collections/types'

export default function CollectionBookSearch({ excludeIds, onAdd }: { excludeIds: ReadonlySet<string>; onAdd: (book: CollectionBookSearchResult) => void }) {
  const [q, setQ] = useState('')
  const [items, setItems] = useState<CollectionBookSearchResult[]>([])
  useEffect(() => {
    if (q.trim().length < 2) { setItems([]); return }
    const timer = window.setTimeout(async () => {
      const response = await fetch(`/api/collections/book-search?q=${encodeURIComponent(q.trim())}`)
      const body = await response.json()
      setItems(response.ok ? body.books : [])
    }, 250)
    return () => clearTimeout(timer)
  }, [q])
  const shown = items.filter(book => !excludeIds.has(book.id))
  return <div><input className="p-input" aria-label="Найти книгу" placeholder="Найти книгу по названию или автору" value={q} onChange={event => setQ(event.target.value)} />{q.trim().length >= 2 && <div role="listbox">{shown.map(book => <button key={book.id} type="button" role="option" aria-selected={false} aria-label={book.title} onClick={() => { onAdd(book); setQ('') }}>{book.title} · {book.author}</button>)}{shown.length === 0 && <p>В каталоге такой книги нет. В подборку можно добавить только книги из каталога — сначала предложите её в каталоге.</p>}</div>}</div>
}
