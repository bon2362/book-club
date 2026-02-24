import { NextResponse } from 'next/server'

// Temporary debug route — remove after investigation
export async function GET() {
  const testBooks = [
    { title: 'Заря всего', author: 'Грэбер' },
    { title: 'Патриот', author: 'Навальный' },
    { title: 'The Semisovereign People', author: 'Schattschneider' },
  ]

  const results = await Promise.all(
    testBooks.map(async ({ title, author }) => {
      try {
        const q = encodeURIComponent(`${title} ${author}`)
        const apiKey = process.env.GOOGLE_BOOKS_API_KEY
        const url = apiKey
          ? `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1&key=${apiKey}`
          : `https://www.googleapis.com/books/v1/volumes?q=${q}&maxResults=1`
        const res = await fetch(url)
        const status = res.status
        if (!res.ok) return { title, status, error: `HTTP ${status}` }

        const data = await res.json() as {
          totalItems?: number
          items?: Array<{ volumeInfo?: { title?: string; imageLinks?: { thumbnail?: string } } }>
        }

        const item = data.items?.[0]
        return {
          title,
          status,
          totalItems: data.totalItems,
          foundTitle: item?.volumeInfo?.title,
          thumbnail: item?.volumeInfo?.imageLinks?.thumbnail ?? null,
        }
      } catch (e) {
        return { title, error: String(e) }
      }
    })
  )

  return NextResponse.json(results, { status: 200 })
}
