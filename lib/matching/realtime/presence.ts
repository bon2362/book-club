import { broadcast } from './hub'

const TIMEOUT_MS = 55_000
const SWEEP_INTERVAL_MS = 10_000

// Map: sessionId → Map<userId, lastSeenMs>
const store = new Map<string, Map<string, number>>()
// Map: sessionId → pseudonym for each userId
const pseudonymStore = new Map<string, Map<string, string>>()

let sweepTimer: ReturnType<typeof setInterval> | null = null

function ensureSession(sessionId: string) {
  if (!store.has(sessionId)) store.set(sessionId, new Map())
  if (!pseudonymStore.has(sessionId)) pseudonymStore.set(sessionId, new Map())
}

export function touch(sessionId: string, userId: string, pseudonym: string): void {
  ensureSession(sessionId)
  store.get(sessionId)!.set(userId, Date.now())
  pseudonymStore.get(sessionId)!.set(userId, pseudonym)
  ensureSweep()
}

export function remove(sessionId: string, userId: string): void {
  store.get(sessionId)?.delete(userId)
  pseudonymStore.get(sessionId)?.delete(userId)
}

export function getOnline(sessionId: string): string[] {
  const now = Date.now()
  const sessionMap = store.get(sessionId)
  if (!sessionMap) return []
  const pseudonyms = pseudonymStore.get(sessionId) ?? new Map()
  const online: string[] = []
  for (const [uid, lastSeen] of Array.from(sessionMap.entries())) {
    if (now - lastSeen < TIMEOUT_MS) {
      online.push(pseudonyms.get(uid) ?? uid)
    }
  }
  return online
}

function sweep() {
  const now = Date.now()
  for (const [sessionId, sessionMap] of Array.from(store.entries())) {
    let changed = false
    for (const [uid, lastSeen] of Array.from(sessionMap.entries())) {
      if (now - lastSeen >= TIMEOUT_MS) {
        sessionMap.delete(uid)
        pseudonymStore.get(sessionId)?.delete(uid)
        changed = true
      }
    }
    if (changed) {
      broadcast(sessionId, 'presence', { online: getOnline(sessionId) })
    }
  }
}

function ensureSweep() {
  if (!sweepTimer) {
    sweepTimer = setInterval(sweep, SWEEP_INTERVAL_MS)
  }
}

export const presence = { touch, remove, getOnline }
