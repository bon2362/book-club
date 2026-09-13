'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CollectionSnapshot } from '@/lib/collections/types'

export type AutosaveState = 'idle' | 'saving' | 'saved' | 'error'

export function useCollectionAutosave({ initialId, content, enabled, delayMs = 800, onCreated }: { initialId: string | null; content: CollectionSnapshot; enabled: boolean; delayMs?: number; onCreated?: (id: string) => void }) {
  const [id, setId] = useState(initialId); const [state, setState] = useState<AutosaveState>('idle'); const [issues, setIssues] = useState<string[]>([])
  const latest = useRef(JSON.stringify(content)); const saved = useRef(JSON.stringify(content)); const idRef = useRef(initialId); const run = useRef<Promise<void> | null>(null)
  latest.current = JSON.stringify(content)
  const save = useCallback(async () => {
    if (run.current) return run.current
    run.current = (async () => { const body = latest.current; const snapshot = JSON.parse(body) as CollectionSnapshot; if (body === saved.current || (!idRef.current && !snapshot.title.trim())) return; setState('saving')
      try { if (!idRef.current) { const r = await fetch('/api/me/collections', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({title:snapshot.title}) }); const d = await r.json(); if (!r.ok) throw d; idRef.current = d.collection.id; setId(d.collection.id); onCreated?.(d.collection.id) }
        const r = await fetch(`/api/me/collections/${idRef.current}`, { method:'PATCH', headers:{'Content-Type':'application/json'}, body }); const d = await r.json(); if (!r.ok) throw d; saved.current = body; setIssues([]); setState('saved')
      } catch (e) { const d=e as {issues?:unknown;error?:unknown}; setIssues(Array.isArray(d.issues) ? d.issues.filter((x): x is string => typeof x==='string') : [typeof d.error==='string'?d.error:'collections_failed']); setState('error') }
    })().finally(() => { run.current=null }); return run.current
  }, [onCreated])
  useEffect(() => { if (!enabled) return; const timer=window.setTimeout(()=>void save(),delayMs); return ()=>window.clearTimeout(timer) }, [enabled,delayMs,save,content])
  return { id, state, issues, flush: save }
}
