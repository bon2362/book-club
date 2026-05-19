'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { capturePageview, identifyUser, initPostHog, resetIdentity } from '@/lib/analytics'

function PageviewTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!pathname) return
    let url = window.location.origin + pathname
    const qs = searchParams?.toString()
    if (qs) url += `?${qs}`
    capturePageview(url)
  }, [pathname, searchParams])

  return null
}

function IdentityTracker() {
  const { data: session, status } = useSession()
  const userId = session?.user?.id
  const isExcluded = session?.user?.isExcludedFromAnalytics

  useEffect(() => {
    if (status === 'loading') return
    if (userId) identifyUser(userId, isExcluded)
    else resetIdentity()
  }, [userId, isExcluded, status])

  return null
}

export default function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog()
  }, [])

  return (
    <>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      <IdentityTracker />
      {children}
    </>
  )
}
