const SIGNUP_KEY = 'collectionSignupIntent'
const CREATE_KEY = 'collectionCreateIntent'
const TTL_MS = 30 * 60_000
function storage(): Storage | null { try { return typeof window === 'undefined' ? null : window.localStorage } catch { return null } }
export function saveSignupIntent(intent: { collectionRef: string; bookId: string }, now = Date.now()) { storage()?.setItem(SIGNUP_KEY, JSON.stringify({ ...intent, savedAt: now })) }
export function consumeSignupIntent(collectionRef: string, now = Date.now()): string | null { const store = storage(); const raw = store?.getItem(SIGNUP_KEY); if (!store || !raw) return null; try { const item = JSON.parse(raw) as { collectionRef?: unknown; bookId?: unknown; savedAt?: unknown }; if (item.collectionRef !== collectionRef) return null; store.removeItem(SIGNUP_KEY); return typeof item.bookId === 'string' && typeof item.savedAt === 'number' && now - item.savedAt <= TTL_MS ? item.bookId : null } catch { store.removeItem(SIGNUP_KEY); return null } }
export function saveCreateIntent(now = Date.now()) { storage()?.setItem(CREATE_KEY, String(now)) }
export function consumeCreateIntent(now = Date.now()): boolean { const store = storage(); const raw = store?.getItem(CREATE_KEY); if (!store || !raw) return false; store.removeItem(CREATE_KEY); return Number.isFinite(Number(raw)) && now - Number(raw) <= TTL_MS }
