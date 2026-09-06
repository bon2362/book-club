'use client'

import { Suspense, useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { capturePageview, identifyUser, initPostHog, resetIdentity, track } from '@/lib/analytics'

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

/**
 * NextAuth при неудачном входе возвращает человека на страницу входа с `?error=`.
 * Самый частый случай — `Verification`: ссылка из письма протухла или уже
 * использована. Разрыв между `auth_email_link_sent` и успешным входом объясняется
 * именно этим событием.
 */
function AuthErrorTracker() {
  const searchParams = useSearchParams()
  const error = searchParams?.get('error') ?? null

  useEffect(() => {
    if (!error) return
    track('auth_error_shown', { reason: error })
  }, [error])

  return null
}

function IdentityTracker() {
  const { data: session, status } = useSession()
  const userId = session?.user?.id
  const provider = session?.user?.provider

  useEffect(() => {
    if (status === 'loading') return
    if (userId) identifyUser(userId, provider)
    else resetIdentity()
  }, [userId, provider, status])

  return null
}

export default function PostHogProvider({
  children,
  identifySession = true,
}: {
  children: React.ReactNode
  identifySession?: boolean
}) {
  useEffect(() => {
    initPostHog()
  }, [])

  return (
    <>
      <Suspense fallback={null}>
        <PageviewTracker />
      </Suspense>
      <Suspense fallback={null}>
        <AuthErrorTracker />
      </Suspense>
      {identifySession && <IdentityTracker />}
      {children}
    </>
  )
}
