import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

const EMAIL = 'e2e-mybooks@test.invalid'
const NAME = 'E2E MyBooks'
const TG_USERNAME = 'e2e_mybooks_tg'

test.describe('ProfileDrawer — Мои книги (три секции по personal_status)', () => {
  test.setTimeout(60_000)

  test.beforeEach(async ({ page }) => {
    await epic('Профиль')
    await feature('Мои книги — статусы')
    await page.request.post('/api/test/session', {
      data: { email: EMAIL, name: NAME, telegramUsername: TG_USERNAME, provider: 'telegram-preauth' },
    })
  })

  test.afterEach(async ({ page }) => {
    await page.request.delete('/api/test/session', {
      data: { email: EMAIL, provider: 'telegram-preauth', telegramUsername: TG_USERNAME },
    })
  })

  test('смена статуса перемещает книгу между секциями и сохраняется после reload', async ({ page, createTestBook }) => {
    const bookA = await createTestBook({ title: 'E2E Reading Book A' })
    const bookB = await createTestBook({ title: 'E2E Signup Book B' })
    const bookC = await createTestBook({ title: 'E2E Read Book C' })

    // Sign up for three books, all with status=null initially
    await page.request.post('/api/test/signup', {
      data: {
        userId: 'placeholder',
        name: NAME,
        email: EMAIL,
        contacts: '@' + TG_USERNAME,
        selectedBookIds: [bookA.id, bookB.id, bookC.id],
      },
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: NAME }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Мои книги' })).toBeVisible()

    // Initially all three are in "записал:ась"
    await expect(dialog.locator('[data-testid="section-signup"]')).toBeVisible()
    await expect(dialog.locator('[data-testid="priority-book-row"]')).toHaveCount(3)
    await expect(dialog.locator('[data-testid="section-reading"]')).toHaveCount(0)
    await expect(dialog.locator('[data-testid="section-read"]')).toHaveCount(0)

    // Tap bookA row → menu opens
    const bookARow = dialog.locator(`[data-book-id="${bookA.id}"]`)
    await bookARow.click()
    await expect(dialog.locator('[data-testid="status-menu"]')).toBeVisible()

    // Switch to "Читаю"
    await dialog.locator('[data-testid="status-option-reading"]').click()
    await page.waitForLoadState('networkidle')

    // bookA moved to "Читаю" section, only 2 left in signup
    await expect(dialog.locator('[data-testid="section-reading"]')).toBeVisible()
    await expect(dialog.locator('[data-testid="section-reading"] [data-book-id="' + bookA.id + '"]')).toBeVisible()
    await expect(dialog.locator('[data-testid="priority-book-row"]')).toHaveCount(2)

    // Set bookC to "read"
    await dialog.locator(`[data-book-id="${bookC.id}"]`).click()
    await dialog.locator('[data-testid="status-option-read"]').click()
    await page.waitForLoadState('networkidle')
    await expect(dialog.locator('[data-testid="section-read"]')).toBeVisible()
    await expect(dialog.locator('[data-testid="priority-book-row"]')).toHaveCount(1)

    // Reload — state must persist
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: NAME }).click()
    const dialog2 = page.getByRole('dialog')
    await expect(dialog2).toBeVisible()

    await expect(dialog2.locator('[data-testid="section-reading"] [data-book-id="' + bookA.id + '"]')).toBeVisible()
    await expect(dialog2.locator('[data-testid="section-signup"] [data-book-id="' + bookB.id + '"]')).toBeVisible()
    await expect(dialog2.locator('[data-testid="section-read"] [data-book-id="' + bookC.id + '"]')).toBeVisible()
  })

  test('возврат книги из «Читаю» в «Записал:ась» ставит её в конец без приоритета', async ({ page, createTestBook }) => {
    const b1 = await createTestBook({ title: 'E2E Rank 1' })
    const b2 = await createTestBook({ title: 'E2E Rank 2' })

    await page.request.post('/api/test/signup', {
      data: {
        userId: 'placeholder',
        name: NAME,
        email: EMAIL,
        contacts: '@' + TG_USERNAME,
        selectedBookIds: [b1.id, b2.id],
      },
    })

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: NAME }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()

    // Drag-end to force a rank save (simulate by calling PUT /api/priorities directly)
    await page.request.put('/api/priorities', {
      data: { bookIds: [b1.id, b2.id] },
    })

    // Move b1 to "Читаю"
    await dialog.locator(`[data-book-id="${b1.id}"]`).click()
    await dialog.locator('[data-testid="status-option-reading"]').click()
    await page.waitForLoadState('networkidle')

    // Move b1 back to "Записал:ась"
    await dialog.locator(`[data-testid="section-reading"] [data-book-id="${b1.id}"]`).click()
    await dialog.locator('[data-testid="status-option-null"]').click()
    await page.waitForLoadState('networkidle')

    // b1 must be at the END of section-signup (after b2), and show "—" badge (unranked)
    const signupRows = dialog.locator('[data-testid="section-signup"] [data-testid="priority-book-row"]')
    await expect(signupRows).toHaveCount(2)
    await expect(signupRows.nth(0)).toHaveAttribute('data-book-id', b2.id)
    await expect(signupRows.nth(1)).toHaveAttribute('data-book-id', b1.id)
    // The returned book carries the "—" placeholder rank badge
    await expect(signupRows.nth(1).locator('text=—')).toBeVisible()
  })
})
