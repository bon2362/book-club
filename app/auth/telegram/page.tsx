'use client'

import { Suspense, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'

function TelegramAuthInner() {
  const searchParams = useSearchParams()
  const router = useRouter()

  useEffect(() => {
    const uid = searchParams.get('uid')
    const token = searchParams.get('token')
    const ts = searchParams.get('ts')

    if (!uid || !token || !ts) {
      router.replace('/')
      return
    }

    signIn('telegram-preauth', { uid, token, ts, redirect: false }).then((result) => {
      if (result?.error) {
        router.replace('/?auth=failed')
      } else {
        router.replace('/')
      }
    })
  }, [searchParams, router])

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <p style={{ color: '#666', fontSize: 14 }}>Входим через Telegram…</p>
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
