'use client'

import { SessionProvider } from 'next-auth/react'
import { usePathname } from 'next/navigation'
import { ScrollHideProvider } from '@/lib/scroll-hide-context'
import PostHogProvider from '@/components/PostHogProvider'

export default function AppProviders({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isCalendarPage = pathname?.startsWith('/calendar/') ?? false
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
