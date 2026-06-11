import { AUTH_PROVIDER_MEMORY_KEY, normalizeRememberedAuthProvider, readRememberedAuthProvider, writeRememberedAuthProvider } from './auth-provider-memory'

function createStorage(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  return {
    getItem: jest.fn((key: string) => store.get(key) ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store.set(key, value)
    }),
    removeItem: jest.fn((key: string) => {
      store.delete(key)
    }),
  }
}

describe('auth-provider-memory', () => {
  it('accepts only google, telegram, and email providers', () => {
    expect(normalizeRememberedAuthProvider('google')).toBe('google')
    expect(normalizeRememberedAuthProvider('telegram')).toBe('telegram')
    expect(normalizeRememberedAuthProvider('email')).toBe('email')
    expect(normalizeRememberedAuthProvider('github')).toBeNull()
    expect(normalizeRememberedAuthProvider('')).toBeNull()
    expect(normalizeRememberedAuthProvider(null)).toBeNull()
  })

  it('round-trips remembered providers through storage', () => {
    const storage = createStorage()

    writeRememberedAuthProvider('google', storage)
    expect(storage.setItem).toHaveBeenCalledWith(AUTH_PROVIDER_MEMORY_KEY, 'google')
    expect(readRememberedAuthProvider(storage)).toBe('google')
  })

  it('returns null when storage contains an invalid value', () => {
    const storage = createStorage({ [AUTH_PROVIDER_MEMORY_KEY]: 'github' })
    expect(readRememberedAuthProvider(storage)).toBeNull()
  })

  it('returns null when storage read throws', () => {
    const storage = {
      getItem: jest.fn(() => {
        throw new Error('boom')
      }),
      setItem: jest.fn(),
    }

    expect(readRememberedAuthProvider(storage)).toBeNull()
  })

  it('swallows storage write errors', () => {
    const storage = {
      getItem: jest.fn(),
      setItem: jest.fn(() => {
        throw new Error('boom')
      }),
    }

    expect(() => writeRememberedAuthProvider('telegram', storage)).not.toThrow()
  })
})
