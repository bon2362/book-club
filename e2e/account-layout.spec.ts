import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

test.beforeEach(async () => {
  await epic('UI')
  await feature('Состояния интерфейса')
})

test.describe('Auth modal remembered provider hint', () => {
  test('google provider badge stays anchored to the button and opens secondary methods automatically', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('slowreading.lastAuthProvider', 'google')
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /^войти$/i }).click()

    const dialog = page.getByRole('dialog', { name: /войти в круг/i })
    await expect(dialog).toBeVisible()
    const googleButton = dialog.getByRole('button', { name: /войти через google/i })
    const emailInput = dialog.getByPlaceholder(/ваш@email.com/i)
    const rememberedBadge = dialog.getByText('Последний вход', { exact: true })

    await expect(googleButton).toBeVisible()
    await expect(emailInput).toBeVisible()
    await expect(dialog.getByText(/В прошлый раз вы входили через Google/)).toBeVisible()
    await expect(rememberedBadge).toBeVisible()

    const dialogBox = await dialog.boundingBox()
    const buttonBox = await googleButton.boundingBox()
    const badgeBox = await rememberedBadge.boundingBox()

    expect(dialogBox).not.toBeNull()
    expect(buttonBox).not.toBeNull()
    expect(badgeBox).not.toBeNull()
    expect(badgeBox!.x).toBeGreaterThanOrEqual(dialogBox!.x - 1)
    expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width + 1)
    expect(badgeBox!.y).toBeLessThan(buttonBox!.y + 2)
    expect(badgeBox!.y + badgeBox!.height).toBeGreaterThan(buttonBox!.y - 16)
    expect(badgeBox!.x + badgeBox!.width).toBeGreaterThan(buttonBox!.x + buttonBox!.width / 2)
  })
})

test.describe('AuthErrorBanner: conditional render', () => {
  test('баннер виден на /?auth=failed и скрыт на /', async ({ page }) => {
    // Переход на /?auth=failed — баннер должен отображаться
    await page.goto('/?auth=failed')
    await page.waitForLoadState('networkidle')
    const banner = page.getByTestId('auth-error-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Не получилось войти через Telegram')

    // Переход на / без параметра — баннера нет
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('auth-error-banner')).toHaveCount(0)
  })
})

test.describe('ProfileDrawer: status accordion menu', () => {
  const EMAIL = 'e2e-mybooks-ui@test.invalid'
  const NAME = 'E2E MyBooks UI'
  const TG = 'e2e_mybooks_ui_tg'

  test('menu opens below tapped row and toggles closed on second tap', async ({ page, createTestBook }) => {
    await page.request.post('/api/test/session', {
      data: { email: EMAIL, name: NAME, telegramUsername: TG, provider: 'telegram-preauth' },
    })
    try {
      const book = await createTestBook({ title: 'E2E Accordion Book' })
      await page.request.post('/api/test/signup', {
        data: { userId: 'placeholder', name: NAME, email: EMAIL, contacts: '@' + TG, telegramUsername: TG, selectedBookIds: [book.id] },
      })
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      await page.getByRole('button', { name: NAME }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      const row = dialog.locator(`[data-book-id="${book.id}"]`)
      await expect(row).toBeVisible()
      await expect(dialog.locator('[data-testid="status-menu"]')).toHaveCount(0)

      const rowBox = await row.boundingBox()
      expect(rowBox).not.toBeNull()

      await row.click()
      const menu = dialog.locator('[data-testid="status-menu"]')
      await expect(menu).toBeVisible()
      const menuBox = await menu.boundingBox()
      expect(menuBox).not.toBeNull()
      // menu is positioned BELOW the row (its top edge is >= row's bottom edge)
      expect(menuBox!.y).toBeGreaterThanOrEqual(rowBox!.y + rowBox!.height - 1)

      // Second tap on same row closes the menu
      await row.click()
      await expect(menu).toHaveCount(0)
    } finally {
      await page.request.delete('/api/test/session', {
        data: { email: EMAIL, provider: 'telegram-preauth', telegramUsername: TG },
      })
    }
  })
})

test.describe('ProfileDrawer: auth methods layout', () => {
  const NAME = 'E2E Auth Methods UI'

  test('telegram-only auth methods show a useful linked state without unlink controls', async ({ page, request }) => {
    test.setTimeout(180_000)
    const providerAccountId = `tg-auth-methods-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await page.setViewportSize({ width: 390, height: 844 })
    const sessionResponse = await page.request.post('/api/test/session', {
      data: { name: NAME, provider: 'telegram-preauth', providerAccountId },
    })
    expect(sessionResponse.ok()).toBe(true)
    const sessionBody = await sessionResponse.json() as { userId: string }
    const profileResponse = await page.request.post('/api/test/signup', {
      data: {
        userId: sessionBody.userId,
        name: NAME,
        contacts: '@e2e_auth_ui',
        selectedBookIds: [],
      },
    })
    expect(profileResponse.ok()).toBe(true)
    try {
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      const profileButton = page.locator('.nd-header-avatar')
      await expect(profileButton).toBeVisible({ timeout: 20_000 })
      await profileButton.click({ timeout: 10_000 })
      const dialog = page.getByRole('dialog', { name: 'Личный кабинет' })
      await expect(dialog).toBeVisible({ timeout: 20_000 })
      await dialog.getByRole('button', { name: 'Профиль' }).click()

      const section = dialog.getByTestId('auth-methods-section')
      const telegramMethod = dialog.getByTestId('auth-method-telegram')
      const googleMethod = dialog.getByTestId('auth-method-google')
      await expect(section).toBeVisible({ timeout: 20_000 })
      await expect(telegramMethod).toBeVisible({ timeout: 20_000 })
      await expect(telegramMethod).toContainText('Telegram ID привязан')
      await expect(telegramMethod).toContainText('последний вход')
      await expect(googleMethod).toContainText('не привязан')
      const emailMethod = dialog.getByTestId('auth-method-email')
      await page.route('**/api/account/identities/email', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      }))
      await emailMethod.getByRole('button', { name: /привязать/i }).click()
      await emailMethod.getByLabel(/email для привязки/i).fill('e2e-link-email@test.invalid')
      await emailMethod.getByRole('button', { name: /получить ссылку/i }).click()
      await expect(emailMethod).toContainText('Проверьте почту')
      await expect(section.getByText('—')).toHaveCount(0)
      await expect(section.getByRole('button', { name: /отвязать/i })).toHaveCount(0)

      const dialogBox = await dialog.boundingBox()
      const sectionBox = await section.boundingBox()
      const telegramBox = await telegramMethod.boundingBox()
      const emailBox = await emailMethod.boundingBox()
      expect(dialogBox).not.toBeNull()
      expect(sectionBox).not.toBeNull()
      expect(telegramBox).not.toBeNull()
      expect(emailBox).not.toBeNull()
      expect(sectionBox!.x).toBeGreaterThanOrEqual(dialogBox!.x - 1)
      expect(sectionBox!.x + sectionBox!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width + 1)
      expect(telegramBox!.x).toBeGreaterThanOrEqual(sectionBox!.x - 1)
      expect(telegramBox!.x + telegramBox!.width).toBeLessThanOrEqual(sectionBox!.x + sectionBox!.width + 1)
      expect(emailBox!.x).toBeGreaterThanOrEqual(sectionBox!.x - 1)
      expect(emailBox!.x + emailBox!.width).toBeLessThanOrEqual(sectionBox!.x + sectionBox!.width + 1)
    } finally {
      await page.goto('about:blank').catch(() => {})
      await request.delete('/api/test/session', {
        data: { provider: 'telegram-preauth', providerAccountId },
        timeout: 15_000,
      }).catch(() => {})
    }
  })
})
