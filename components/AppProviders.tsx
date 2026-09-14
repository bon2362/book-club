'use client'

import { useEffect } from 'react'
import { SessionProvider } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { ScrollHideProvider } from '@/lib/scroll-hide-context'
import PostHogProvider from '@/components/PostHogProvider'

export default function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isCalendarPage = pathname?.startsWith('/calendar/') ?? false

  useEffect(() => {
    // Признак гидратации для E2E (waitForHydration в e2e/helpers.ts). Ставится через кадр,
    // чтобы успели отрисоваться обновления из эффектов дочерних компонентов — например,
    // авто-открытие формы контактов, — иначе проверки «элемента нет» проходили бы раньше.
    const frame = requestAnimationFrame(() => {
      document.documentElement.dataset.hydrated = 'true'
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  const content = (
    <PostHogProvider identifySession={!isCalendarPage}>
      <ScrollHideProvider>
        {children}
      </ScrollHideProvider>
    </PostHogProvider>
  )

  if (isCalendarPage) return content
  return <SessionProvider>{content}</SessionProvider>
}
