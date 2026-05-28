'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import MatchingRealtimeClient from './MatchingRealtimeClient'

interface Props {
  sessionId: string
}

export default function MatchingRealtimeWrapper({ sessionId }: Props) {
  const router = useRouter()

  const handleStateChange = useCallback(() => {
    router.refresh()
  }, [router])

  const handleFrozen = useCallback(() => {
    router.refresh()
  }, [router])

  return (
    <MatchingRealtimeClient
      sessionId={sessionId}
      onStateChange={handleStateChange}
      onFrozen={handleFrozen}
    />
  )
}
