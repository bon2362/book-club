'use client'

import { Suspense, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { track } from '@/lib/analytics'

function TelegramAuthInner() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const token = searchParams.get('token')
    const ts = searchParams.get('ts')

    if (!token || !ts) {
      console.error('[telegram-preauth] page: no token/ts in URL')
      router.replace('/')
      return
    }

    signIn('telegram-preauth', { token, ts, redirect: false })
      .then((result) => {
        if (result?.error) {
          console.error('[telegram-preauth] signIn returned error', result.error)
          router.replace('/?auth=failed')
        } else {
          track('auth_success', { provider: 'telegram' })
          router.replace('/')
        }
      })
      .catch((e) => {
        console.error('[telegram-preauth] signIn threw', e)
        router.replace('/?auth=failed')
      })
  }, [searchParams, router])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Входим через Telegram…</p>
    </div>
  )
}

export default function TelegramAuthPage() {
  return (
    <Suspense fallback={null}>
      <TelegramAuthInner />
    </Suspense>
  )
}
