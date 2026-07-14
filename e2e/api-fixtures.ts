import { request as playwrightRequest, type APIRequestContext } from '@playwright/test'
import { test as base, expect } from './fixtures'

type TestBook = { id: string; title: string; author: string }
type Session = { id: string; name: string; minGroupSize: number; maxGroupSize: number }

export type ApiIdentity = {
  email: string
  name: string
  userId: string
  request: APIRequestContext
}

type MatchingApiFixture = {
  session: Session
  books: [TestBook, TestBook]
  participantA: ApiIdentity
  participantB: ApiIdentity
  admin: ApiIdentity
  addParticipant: (name: string, rankedBooks?: TestBook[]) => Promise<ApiIdentity>
}

export const test = base.extend<{ matchingApiFixture: MatchingApiFixture }>({
  matchingApiFixture: async ({ createMatchingSession, createTestBook, auditCleanup }, use, testInfo) => {
    const contexts: APIRequestContext[] = []
    const cleanupUsers: Array<{ request: APIRequestContext; email: string }> = []
    const identitySetups: Array<Promise<ApiIdentity>> = []
    const baseURL = String(testInfo.project.use.baseURL)
    const session = await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
    const books = await Promise.all([
      createTestBook({ title: `API Matching A ${testInfo.testId}`, author: 'API Author A' }),
      createTestBook({ title: `API Matching B ${testInfo.testId}`, author: 'API Author B' }),
    ]) as [TestBook, TestBook]

    const identity = (label: string, name: string, isAdmin = false): Promise<ApiIdentity> => {
      const pending = (async () => {
        const request = await playwrightRequest.newContext({ baseURL, ignoreHTTPSErrors: true })
        contexts.push(request)
        const email = `e2e-api-${testInfo.testId}-${label}-${Date.now()}@test.invalid`
        cleanupUsers.push({ request, email })
        const login = await request.post('/api/test/session', {
          data: { email, name, isAdmin, telegramUsername: `api_matching_${label}_${Date.now()}` },
        })
        if (!login.ok()) throw new Error(`API identity failed: ${login.status()} ${await login.text()}`)
        const { userId } = await login.json() as { userId: string }
        auditCleanup.trackUser(userId)
        return { email, name, userId, request }
      })()
      identitySetups.push(pending)
      return pending
    }

    const join = async (participant: ApiIdentity, rankedBooks: TestBook[] = books) => {
      const joined = await participant.request.post(`/api/matching/sessions/${session.id}/join`, { data: { name: participant.name } })
      if (!joined.ok()) throw new Error(`API join failed: ${joined.status()} ${await joined.text()}`)
      for (const book of rankedBooks) {
        const added = await participant.request.post('/api/matching/books', { data: { bookId: book.id } })
        if (!added.ok()) throw new Error(`API shortlist failed: ${added.status()} ${await added.text()}`)
      }
      const ranked = await participant.request.patch('/api/matching/priorities', { data: { bookIds: rankedBooks.map(book => book.id) } })
      if (!ranked.ok()) throw new Error(`API rank failed: ${ranked.status()} ${await ranked.text()}`)
      return participant
    }

    let extra = 0
    const addParticipant = async (name: string, rankedBooks: TestBook[] = books) => (
      join(await identity(`extra-${extra++}`, name), rankedBooks)
    )

    try {
      const identityResults = await Promise.allSettled([
        addParticipant('Анна API E2E'),
        addParticipant('Борис API E2E'),
        identity('admin', 'Администратор API E2E', true),
      ])
      const identityFailure = identityResults.find(result => result.status === 'rejected')
      if (identityFailure?.status === 'rejected') throw identityFailure.reason
      const [participantA, participantB, admin] = identityResults.map(result => (
        result as PromiseFulfilledResult<ApiIdentity>
      ).value)
      await use({ session, books, participantA, participantB, admin, addParticipant })
    } finally {
      await Promise.allSettled(identitySetups)
      const teardownErrors: unknown[] = []
      for (const user of cleanupUsers.reverse()) {
        try {
          const response = await user.request.delete('/api/test/session', { data: { email: user.email } })
          if (!response.ok()) teardownErrors.push(new Error(`matchingApiFixture cleanup failed: ${response.status()} ${await response.text()}`))
        } catch (error) {
          teardownErrors.push(error)
        }
      }
      for (const context of contexts.reverse()) {
        try {
          await context.dispose()
        } catch (error) {
          teardownErrors.push(error)
        }
      }
      if (teardownErrors.length > 0) throw new AggregateError(teardownErrors, 'matchingApiFixture teardown failed')
    }
  },
})

export { expect }
