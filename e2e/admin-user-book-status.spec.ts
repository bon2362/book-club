import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

const ADMIN_EMAIL = 'e2e-admin-book-status@test.invalid'
const USER_EMAIL  = 'e2e-user-book-status@test.invalid'
const USER_NAME   = 'E2E BookStatus User'
const TG          = 'e2e_bookstatus_tg'
const USER_ID     = `test:${USER_EMAIL}`

test.describe('Admin: смена personalStatus книги за пользователя', () => {
  test.setTimeout(90_000)

  test.beforeEach(async () => {
    await epic('Admin')
    await feature('Смена статуса книги')
  })

  test('админ переводит книгу в «Читаю» — книга уходит в секцию Читаю, статус сохраняется после reload', async ({ page, createTestBook }) => {
    const book = await createTestBook({ title: 'E2E Admin Status Book' })

    await page.request.post('/api/test/session', {
      data: { email: USER_EMAIL, name: USER_NAME, telegramUsername: TG, provider: 'telegram-preauth' },
    })
    await page.request.post('/api/test/signup', {
      data: { userId: USER_ID, name: USER_NAME, email: USER_EMAIL, contacts: '@' + TG, telegramUsername: TG, selectedBookIds: [book.id] },
    })
    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: 'E2E Admin', isAdmin: true },
    })

    try {
      await page.goto('/admin')
      await page.waitForLoadState('networkidle')

      // Открыть drawer пользователя
      await page.getByLabel('Поиск пользователей').fill(USER_NAME)
      await page.locator('tr').filter({ hasText: USER_NAME }).click()
      const drawer = page.getByRole('dialog')
      await expect(drawer).toBeVisible()

      // Меню закрыто — кнопки статуса не видны
      await expect(drawer.locator('[data-testid="admin-status-option-null"]')).toHaveCount(0)

      // Найти кнопку с названием книги и кликнуть на неё
      const chip = drawer.locator('button', { hasText: book.title })
      await expect(chip).toBeVisible()
      await chip.click()

      // Меню открылось
      await expect(drawer.locator('[data-testid="admin-status-option-reading"]')).toBeVisible()

      // Выбрать «Читаю»
      const patchDone = page.waitForResponse(r =>
        r.url().includes(`/api/signup-books/${book.id}/status`) && r.request().method() === 'PATCH'
      )
      await drawer.locator('[data-testid="admin-status-option-reading"]').click()
      await patchDone
      await page.waitForLoadState('networkidle')

      // Книга должна быть в секции «Читаю» (заголовок секции виден)
      await expect(drawer.locator('text=Читаю').first()).toBeVisible()
      // Чип книги всё ещё виден
      await expect(drawer.locator('button', { hasText: book.title })).toBeVisible()

      // После полной перезагрузки drawer открывается заново с серверными данными.
      await page.reload()
      await page.getByLabel('Поиск пользователей').fill(USER_NAME)
      await page.locator('tr').filter({ hasText: USER_NAME }).click()
      const reloadedDrawer = page.getByRole('dialog')
      await expect(reloadedDrawer).toBeVisible()
      await expect(reloadedDrawer.locator('text=Читаю').first()).toBeVisible()
      await expect(reloadedDrawer.locator('button', { hasText: book.title })).toBeVisible()

      // Проверить персистентность через API
      const userState = await (await page.request.get(
        `/api/test/user?telegramUsername=${encodeURIComponent(TG)}`
      )).json()
      const entry = (userState.signups as { bookId: string; personalStatus: string | null }[])
        .find(s => s.bookId === book.id)
      expect(entry?.personalStatus).toBe('reading')
    } finally {
      await page.request.delete('/api/test/session', { data: { email: ADMIN_EMAIL } })
      await page.request.delete('/api/test/session', {
        data: { email: USER_EMAIL, provider: 'telegram-preauth', telegramUsername: TG },
      })
      await page.request.delete('/api/test/signup', { data: { userId: USER_ID } })
    }
  })

  test('закрытая matching-сессия не блокирует статус и сохраняет historical hard intent', async ({ matchingBooksFixture, dbExec }) => {
    const { session, books, participantA, admin } = matchingBooksFixture
    const participantStateResponse = await participantA.request.get(`/api/matching/state?session=${session.id}`)
    expect(participantStateResponse.ok(), await participantStateResponse.text()).toBe(true)
    const participantState = await participantStateResponse.json() as {
      session: { stateVersion: number }
    }
    const hardResponse = await participantA.request.post(`/api/matching/sessions/${session.id}/book-actions`, {
      data: { action: 'setHard', bookId: books[0].id, expectedStateVersion: participantState.session.stateVersion },
    })
    expect(hardResponse.ok(), await hardResponse.text()).toBe(true)

    const adminStateResponse = await admin.request.get(`/api/matching/state?session=${session.id}&as=${participantA.userId}`)
    expect(adminStateResponse.ok(), await adminStateResponse.text()).toBe(true)
    const adminState = await adminStateResponse.json() as { session: { stateVersion: number } }
    const closeResponse = await admin.request.post(`/api/admin/matching/sessions/${session.id}/book-admin-actions`, {
      data: { action: 'closeSession', expectedStateVersion: adminState.session.stateVersion },
    })
    expect(closeResponse.ok(), await closeResponse.text()).toBe(true)

    const statusResponse = await admin.request.patch(
      `/api/signup-books/${books[0].id}/status?as=${encodeURIComponent(participantA.userId)}`,
      { data: { status: 'reading' } },
    )
    expect(statusResponse.ok(), await statusResponse.text()).toBe(true)

    const detailsResponse = await admin.request.get(`/api/admin/users/${encodeURIComponent(participantA.userId)}`)
    expect(detailsResponse.ok(), await detailsResponse.text()).toBe(true)
    const details = await detailsResponse.json() as {
      data: { signupBooks: Array<{ bookId: string; personalStatus: string | null }> }
    }
    expect(details.data.signupBooks.find((book) => book.bookId === books[0].id)?.personalStatus).toBe('reading')

    const historicalIntents = await dbExec(
      `select kind
       from matching_book_intents
       where session_id = $1 and user_id = $2 and book_id = $3`,
      [session.id, participantA.userId, books[0].id],
    )
    expect(historicalIntents).toEqual([{ kind: 'hard' }])
  })
})
