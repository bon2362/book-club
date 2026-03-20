/**
 * @jest-environment node
 */
import { GET } from './route'
import { db } from '@/lib/db'

// --- Resend mock ---
const mockEmailSend = jest.fn()
jest.mock('resend', () => ({
  Resend: jest.fn().mockImplementation(() => ({
    emails: { send: mockEmailSend },
  })),
}))

// --- DB mock ---
// db.update is called multiple times per invocation:
//   1. Stale-lock reset  — awaited directly (no .returning())
//   2. Atomic capture    — awaited via .returning()
//   3. Release / mark-sent — awaited directly (no .returning())
jest.mock('@/lib/db', () => ({
  db: { update: jest.fn() },
}))
jest.mock('@/lib/db/schema', () => ({ notificationQueue: {} }))

const mockDbUpdate = db.update as jest.Mock

// Build a mock return value for one db.update() call.
// The returned object is both thenable (for await-without-returning)
// and has a .returning() method (for await-with-returning).
function makeMockUpdate(rows: object[]) {
  const returning = jest.fn().mockResolvedValue(rows)
  const where = jest.fn().mockReturnValue({
    returning,
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(undefined).then(resolve, reject),
    catch: (reject: (e: unknown) => void) =>
      Promise.resolve(undefined).catch(reject),
  })
  return { set: jest.fn().mockReturnValue({ where }) }
}

// Configure sequential db.update() calls for a test.
// `captureRows` is what the atomic-capture call (2nd call) returns via .returning().
// Additional calls (release lock, mark sent) use an empty default.
function setupDbMock(captureRows: object[]) {
  // Call 1: stale-lock reset
  mockDbUpdate.mockReturnValueOnce(makeMockUpdate([]))
  // Call 2: atomic capture → returns captureRows
  mockDbUpdate.mockReturnValueOnce(makeMockUpdate(captureRows))
  // Fallback for subsequent calls (release lock, mark sent)
  mockDbUpdate.mockReturnValue(makeMockUpdate([]))
}

function makeRow(overrides: Partial<{
  id: string
  userName: string
  userEmail: string
  contacts: string
  addedBooks: string
  isNew: boolean
  createdAt: Date
}> = {}) {
  return {
    id: 'row-1',
    userName: 'Тест',
    userEmail: 'test@test.com',
    contacts: '@test',
    addedBooks: JSON.stringify(['Книга А']),
    isNew: true,
    createdAt: new Date(Date.now() - 35 * 60 * 1000), // 35 min ago — cooled
    ...overrides,
  }
}

function makeRequest(opts: { secret?: string } = {}) {
  const headers: Record<string, string> = {}
  if (opts.secret !== undefined) {
    headers['Authorization'] = `Bearer ${opts.secret}`
  }
  return new Request('http://localhost/api/cron/digest', { headers })
}

const VALID_SECRET = 'test-secret'

describe('GET /api/cron/digest', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env.CRON_SECRET = VALID_SECRET
    process.env.ADMIN_EMAIL = 'admin@test.com'
    process.env.RESEND_API_KEY = 'test-key'
    mockEmailSend.mockResolvedValue({})
  })

  afterEach(() => {
    delete process.env.CRON_SECRET
    delete process.env.ADMIN_EMAIL
    delete process.env.RESEND_API_KEY
  })

  // --- Authorization ---

  it('возвращает 401 без заголовка Authorization', async () => {
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('возвращает 401 при неверном токене', async () => {
    const res = await GET(makeRequest({ secret: 'wrong-secret' }))
    expect(res.status).toBe(401)
  })

  it('возвращает 401 если CRON_SECRET не задан в env', async () => {
    delete process.env.CRON_SECRET
    const res = await GET(makeRequest({ secret: VALID_SECRET }))
    expect(res.status).toBe(401)
  })

  // --- Early exits (before DB) ---

  it('возвращает 200 skipped:no-admin-email если ADMIN_EMAIL не задан', async () => {
    delete process.env.ADMIN_EMAIL
    const res = await GET(makeRequest({ secret: VALID_SECRET }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.skipped).toBe('no-admin-email')
    expect(mockDbUpdate).not.toHaveBeenCalled()
  })

  // --- Queue states ---

  it('возвращает 200 skipped:empty при пустой очереди', async () => {
    setupDbMock([]) // capture returns empty array
    const res = await GET(makeRequest({ secret: VALID_SECRET }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.skipped).toBe('empty')
    expect(mockEmailSend).not.toHaveBeenCalled()
  })

  it('возвращает 200 skipped:cooling если всплеск не остыл (< 30 мин)', async () => {
    const freshRow = makeRow({ createdAt: new Date(Date.now() - 10 * 60 * 1000) })
    setupDbMock([freshRow])
    const res = await GET(makeRequest({ secret: VALID_SECRET }))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.skipped).toBe('cooling')
    expect(mockEmailSend).not.toHaveBeenCalled()
    // Lock must be released: stale-reset + capture + release = 3 calls
    expect(mockDbUpdate).toHaveBeenCalledTimes(3)
  })

  // --- Digest sent ---

  it('отправляет дайджест если очередь остыла (> 30 мин)', async () => {
    const cooledRow = makeRow() // 35 min ago by default
    setupDbMock([cooledRow])
    const res = await GET(makeRequest({ secret: VALID_SECRET }))
    expect(res.status).toBe(200)
    expect(mockEmailSend).toHaveBeenCalledTimes(1)
    const callArg = mockEmailSend.mock.calls[0][0]
    expect(callArg.to).toBe('admin@test.com')
    expect(callArg.subject).toMatch(/дайджест/i)
  })

  it('отправляет дайджест при принудительном сбросе (старейшая строка > 2 ч)', async () => {
    const oldRow = makeRow({
      id: 'old',
      createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
    })
    const freshRow = makeRow({
      id: 'fresh',
      createdAt: new Date(Date.now() - 10 * 60 * 1000), // 10 min ago (still cooling)
    })
    setupDbMock([oldRow, freshRow])
    const res = await GET(makeRequest({ secret: VALID_SECRET }))
    expect(res.status).toBe(200)
    expect(mockEmailSend).toHaveBeenCalledTimes(1)
  })

  // --- Error handling ---

  it('возвращает 500 и освобождает блокировку если Resend упал', async () => {
    const cooledRow = makeRow()
    setupDbMock([cooledRow])
    mockEmailSend.mockRejectedValue(new Error('Resend error'))
    const res = await GET(makeRequest({ secret: VALID_SECRET }))
    expect(res.status).toBe(500)
    // stale-reset + capture + release-on-error = 3 calls
    expect(mockDbUpdate).toHaveBeenCalledTimes(3)
  })

  // --- Stale lock reset ---

  it('сбрасывает зависшие строки в начале каждого цикла', async () => {
    setupDbMock([]) // empty queue
    await GET(makeRequest({ secret: VALID_SECRET }))
    // stale-reset (call 1) + capture (call 2) = 2 total
    expect(mockDbUpdate).toHaveBeenCalledTimes(2)
  })
})
