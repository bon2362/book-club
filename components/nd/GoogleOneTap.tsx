'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from 'next-auth/react'

export default function GoogleOneTap() {
  const router = useRouter()

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => {
      window.google?.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        callback: async ({ credential }: { credential: string }) => {
          await signIn('google-one-tap', { credential, redirect: false })
          router.refresh()
        },
      })
      window.google?.accounts.id.prompt()
    }
    document.body.appendChild(script)
    return () => {
      // Cancel the prompt if still visible, then remove script
      window.google?.accounts.id.cancel()
      document.body.removeChild(script)
    }
  }, [router])

  return null
}
