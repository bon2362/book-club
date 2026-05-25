'use client'

import { useEffect } from 'react'

export default function SiteVisitTracker() {
  useEffect(() => {
    fetch('/api/activity/site-visit', {
      method: 'POST',
      keepalive: true,
    }).catch(() => {})
  }, [])

  return null
}
