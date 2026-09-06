'use client'

import { useEffect } from 'react'
import { track } from '@/lib/analytics'

interface Props {
  bookSlug: string
  summaryCount: number
}

/**
 * Ничего не рендерит — только шлёт `summaries_opened` при открытии страницы
 * саммари книги. Страница `app/books/[bookSlug]/summaries/page.tsx` серверная,
 * поэтому трекер вынесен в отдельный минимальный клиентский компонент
 * (по образцу трекеров в components/PostHogProvider.tsx).
 */
export default function SummariesOpenedTracker({ bookSlug, summaryCount }: Props) {
  useEffect(() => {
    track('summaries_opened', { book_slug: bookSlug, summary_count: summaryCount })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookSlug])

  return null
}
