'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CollectionSnapshot } from '@/lib/collections/types'

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'error'

interface Options {
  initialId: string | null
  content: CollectionSnapshot
  enabled: boolean
  delayMs?: number
  onCreated?: (id: string) => void
}

function issuesFrom(error: unknown): string[] {
  const body = (error ?? {}) as { issues?: unknown; error?: unknown }
  if (Array.isArray(body.issues)) return body.issues.filter((issue): issue is string => typeof issue === 'string')
  return [typeof body.error === 'string' ? body.error : 'collections_failed']
}

/**
 * Автосохранение неопубликованной подборки: черновик создаётся, как только появилось
 * название, дальше — отложенный PATCH после паузы в наборе.
 */
export function useCollectionAutosave({ initialId, content, enabled, delayMs = 800, onCreated }: Options) {
  const [id, setId] = useState(initialId)
  const [state, setState] = useState<AutosaveState>('idle')
  const [issues, setIssues] = useState<string[]>([])

  const contentKey = JSON.stringify(content)
  const latestKey = useRef(contentKey)
  const savedKey = useRef(contentKey)
  const idRef = useRef(initialId)
  const inFlight = useRef<Promise<void> | null>(null)
  const again = useRef(false)
  latestKey.current = contentKey

  const save = useCallback(async (): Promise<void> => {
    // Второй вызов во время сохранения не создаёт второй черновик — просто повторим после.
    if (inFlight.current) {
      again.current = true
      return inFlight.current
    }

    const run = async () => {
      const key = latestKey.current
      const snapshot = JSON.parse(key) as CollectionSnapshot
      if (key === savedKey.current) return
      if (!idRef.current && !snapshot.title.trim()) return

      setState('saving')
      try {
        if (!idRef.current) {
          const response = await fetch('/api/me/collections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: snapshot.title }),
          })
          const body = await response.json()
          if (!response.ok) throw body
          idRef.current = body.collection.id as string
          setId(idRef.current)
          onCreated?.(idRef.current)
        }

        const response = await fetch(`/api/me/collections/${idRef.current}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: key,
        })
        const body = await response.json()
        if (!response.ok) throw body
        savedKey.current = key
        setIssues([])
        setState('saved')
      } catch (error) {
        setIssues(issuesFrom(error))
        setState('error')
      }
    }

    inFlight.current = run().finally(() => {
      inFlight.current = null
    })
    await inFlight.current
    if (again.current) {
      again.current = false
      await save()
    }
  }, [onCreated])

  useEffect(() => {
    if (!enabled) return
    const timer = window.setTimeout(() => {
      void save()
    }, delayMs)
    return () => window.clearTimeout(timer)
  }, [enabled, delayMs, save, contentKey])

  return { id, state, issues, flush: save }
}
