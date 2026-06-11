export const AUTH_PROVIDER_MEMORY_KEY = 'slowreading.lastAuthProvider'

export type RememberedAuthProvider = 'google' | 'telegram' | 'email'

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export function normalizeRememberedAuthProvider(value: unknown): RememberedAuthProvider | null {
  if (value === 'google' || value === 'telegram' || value === 'email') {
    return value
  }
  return null
}

export function readRememberedAuthProvider(storage: StorageLike | undefined = globalThis.localStorage): RememberedAuthProvider | null {
  try {
    return normalizeRememberedAuthProvider(storage?.getItem(AUTH_PROVIDER_MEMORY_KEY))
  } catch {
    return null
  }
}

export function writeRememberedAuthProvider(
  provider: RememberedAuthProvider,
  storage: StorageLike | undefined = globalThis.localStorage
): void {
  try {
    storage?.setItem(AUTH_PROVIDER_MEMORY_KEY, provider)
  } catch {
    // Ignore storage quota / privacy mode errors; this is only a UI hint.
  }
}
