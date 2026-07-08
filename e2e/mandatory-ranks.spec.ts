import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

const EMAIL = 'e2e-mandatory-ranks@test.invalid'
const NAME = 'E2E Mandatory Ranks'
const TG_USERNAME = 'e2e_mandatory_ranks_tg'

test.describe('Обязательный ранг у каждой записи (mandatory book ranks)', () => {
  test.setTimeout(60_000)

  test.beforeEach(async ({ page }) => {
    await epic('Каталог книг')
    await feature('Обязательные ранги')
    await page.request.post('/api/test/session', {
      data: { email: EMAIL, name: NAME, telegramUsername: TG_USERNAME, provider: 'telegram-preauth' },
    })
  })

  test.afterEach(async ({ page }) => {
    await page.request.delete('/api/test/session', {
      data: { email: EMAIL, provider: 'telegram-preauth', telegramUsername: TG_USERNAME },
    })
  })

  test('запись на книгу получает числовой ранг сразу и переживает reload', async ({ page, createTestBook }) => {
    // Sign up for 4 books so our target book lands at rank 4 — past the
    // top-3 medal emoji rendering (🏆/🥈/🥉), so the badge is a plain digit.
    // createTestBook mutates shared per-fixture state (id index) — must be
    // awaited sequentially, not via Promise.all, to avoid an id collision.
    const decoyBooks = []
    for (let i = 1; i <= 3; i++) {
      decoyBooks.push(await createTestBook({ title: `E2E Mandatory Rank Decoy ${i} ${test.info().testId}` }))
    }
    const book = await createTestBook({ title: `E2E Mandatory Rank Book ${test.info().testId}` })

    // Sign up via the real /api/signup path (catalog choke-point), same as a
    // user submitting the profile form for the first time.
    const signupRes = await page.request.post('/api/signup', {
      data: {
        name: NAME,
        contacts: '@' + TG_USERNAME,
        selectedBookIds: [...decoyBooks.map(b => b.id), book.id],
      },
    })
    expect(signupRes.ok()).toBeTruthy()

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: NAME }).click()
    const dialog = page.getByRole('dialog', { name: /личный кабинет/i })
    await expect(dialog).toBeVisible()

    const row = dialog.locator(`[data-testid="section-signup"] [data-book-id="${book.id}"]`)
    await expect(row).toBeVisible()

    // Rank badge must be numeric — not the "—" unranked placeholder.
    const rankBadgeText = (await row.locator('span').first().textContent())?.trim()
    expect(rankBadgeText).toBe('4')
    expect(rankBadgeText).not.toBe('—')

    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: NAME }).click()
    const dialog2 = page.getByRole('dialog', { name: /личный кабинет/i })
    await expect(dialog2).toBeVisible()

    const rowAfterReload = dialog2.locator(`[data-testid="section-signup"] [data-book-id="${book.id}"]`)
    await expect(rowAfterReload).toBeVisible()
    const rankBadgeTextAfterReload = (await rowAfterReload.locator('span').first().textContent())?.trim()
    expect(rankBadgeTextAfterReload).toBe(rankBadgeText)
  })

  test('возврат книги из «Читаю» в «Записал:ась» восстанавливает ранг в конце списка после reload', async ({ page, createTestBook }) => {
    // b1 is signed up first (rank 1) and later moved to "Читаю" then back to
    // "Записал:ась"; b2/b3/b4 keep the top-3 slots occupied so the restored
    // b1 lands at rank 4 — past the medal-emoji rendering, a plain digit.
    const b1 = await createTestBook({ title: `E2E Mandatory Rank A ${test.info().testId}` })
    const b2 = await createTestBook({ title: `E2E Mandatory Rank B ${test.info().testId}` })
    const b3 = await createTestBook({ title: `E2E Mandatory Rank C ${test.info().testId}` })
    const b4 = await createTestBook({ title: `E2E Mandatory Rank D ${test.info().testId}` })

    await page.request.post('/api/test/signup', {
      data: {
        userId: 'placeholder',
        name: NAME,
        email: EMAIL,
        contacts: '@' + TG_USERNAME,
        telegramUsername: TG_USERNAME,
        selectedBookIds: [b1.id, b2.id, b3.id, b4.id],
      },
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: NAME }).click()
    const dialog = page.getByRole('dialog', { name: /личный кабинет/i })
    await expect(dialog).toBeVisible()

    // b1 has a rank (mandatory — assigned automatically at signup): rank 1 → 🏆.
    const b1Row = dialog.locator(`[data-testid="section-signup"] [data-book-id="${b1.id}"]`)
    await expect(b1Row).toBeVisible()
    const b1RankBefore = (await b1Row.locator('span').first().textContent())?.trim()
    expect(b1RankBefore).toBe('🏆')

    // Mark b1 as "Читаю" — leaves the priority section. ProfileDrawer follows
    // the PATCH with a PUT /api/priorities re-save (since prioritiesSet is
    // true once any book has a rank) — wait for both, not just the PATCH,
    // before continuing: proceeding while the PUT is still in flight races
    // it against the next status change's own book_priorities read/write.
    await b1Row.click()
    await expect(dialog.locator('[data-testid="status-menu"]')).toBeVisible()
    const patchReading = page.waitForResponse(r => r.url().includes('/api/signup-books/') && r.request().method() === 'PATCH')
    const putPrioritiesAfterReading = page.waitForResponse(r => r.url().includes('/api/priorities') && r.request().method() === 'PUT')
    await dialog.locator('[data-testid="status-option-reading"]').click()
    await patchReading
    await putPrioritiesAfterReading
    await page.waitForLoadState('networkidle')
    await expect(dialog.locator(`[data-testid="section-reading"] [data-book-id="${b1.id}"]`)).toBeVisible()

    // Return b1's status to null.
    const patchNull = page.waitForResponse(r => r.url().includes('/api/signup-books/') && r.request().method() === 'PATCH')
    await dialog.locator(`[data-testid="section-reading"] [data-book-id="${b1.id}"]`).click()
    await dialog.locator('[data-testid="status-option-null"]').click()
    await patchNull
    await page.waitForLoadState('networkidle')

    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: NAME }).click()
    const dialog2 = page.getByRole('dialog', { name: /личный кабинет/i })
    await expect(dialog2).toBeVisible()

    // b1 is back in "Записал:ась", at the end of the list, with a numeric rank —
    // not the "—" placeholder that meant "no priority" under the old model.
    const signupRows = dialog2.locator('[data-testid="section-signup"] [data-testid="priority-book-row"]')
    await expect(signupRows).toHaveCount(4)
    await expect(signupRows.nth(0)).toHaveAttribute('data-book-id', b2.id)
    await expect(signupRows.nth(1)).toHaveAttribute('data-book-id', b3.id)
    await expect(signupRows.nth(2)).toHaveAttribute('data-book-id', b4.id)
    await expect(signupRows.nth(3)).toHaveAttribute('data-book-id', b1.id)

    const b1RankAfter = (await signupRows.nth(3).locator('span').first().textContent())?.trim()
    expect(b1RankAfter).toBe('4')
    expect(b1RankAfter).not.toBe('—')
  })
})
