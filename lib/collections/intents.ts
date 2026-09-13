const SIGNUP_KEY = 'collectionSignupIntent'
const CREATE_KEY = 'collectionCreateIntent'
const TTL_MS = 30 * 60_000

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Гость нажал «Хочу читать»: после входа книга запишется автоматически. */
export function saveSignupIntent(intent: { collectionRef: string; bookId: string }, now = Date.now()): void {
  storage()?.setItem(SIGNUP_KEY, JSON.stringify({ ...intent, savedAt: now }))
}

export function consumeSignupIntent(collectionRef: string, now = Date.now()): string | null {
  const store = storage()
  const raw = store?.getItem(SIGNUP_KEY)
  if (!store || !raw) return null
  try {
    const parsed = JSON.parse(raw) as { collectionRef?: unknown; bookId?: unknown; savedAt?: unknown }
    if (parsed.collectionRef !== collectionRef) return null
    store.removeItem(SIGNUP_KEY)
    if (typeof parsed.savedAt !== 'number' || now - parsed.savedAt > TTL_MS) return null
    return typeof parsed.bookId === 'string' ? parsed.bookId : null
  } catch {
    store.removeItem(SIGNUP_KEY)
    return null
  }
}

/** Гость нажал «Собрать свою»: после входа откроется редактор. */
export function saveCreateIntent(now = Date.now()): void {
  storage()?.setItem(CREATE_KEY, String(now))
}

export function consumeCreateIntent(now = Date.now()): boolean {
  const store = storage()
  const raw = store?.getItem(CREATE_KEY)
  if (!store || !raw) return false
  store.removeItem(CREATE_KEY)
  const savedAt = Number(raw)
  return Number.isFinite(savedAt) && now - savedAt <= TTL_MS
}
