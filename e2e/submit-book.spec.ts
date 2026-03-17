import { type Page, test, expect } from '@playwright/test'

const TEST_EMAIL = 'e2e-submit@test.invalid'
const TEST_NAME = 'E2E Submit User'

// Ждём гидрации React и закрываем ContactsForm, если появилась
async function waitAndCloseContactsForm(page: Page) {
  // networkidle: нет сетевой активности 500ms — React точно гидрировался
  await page.waitForLoadState('networkidle')
  const dialog = page.getByRole('dialog')
  if (await dialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible({ timeout: 5000 })
  }
}

test.afterEach(async ({ page }) => {
  await page.request.delete('/api/test/session', {
    data: { email: TEST_EMAIL },
  })
})

// ─── Неавторизованный пользователь ────────────────────────────────────────────

test('неавторизованный: клик «Предложить книгу» открывает форму входа', async ({ page }) => {
  await page.goto('/')
  await page.waitForSelector('article, [aria-label="Предложить книгу"]', { timeout: 10000 }).catch(() => {})

  const btn = page.getByRole('button', { name: /предложить книгу/i }).first()
  await expect(btn).toBeVisible()
  await btn.click()

  // Должна открыться модалка авторизации, а не форма предложения
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('dialog').getByText(/войти|авторизац|вход/i).first()).toBeVisible()
  await expect(page.locator('#sb-title')).not.toBeVisible()
})

// ─── Открытие и закрытие формы ────────────────────────────────────────────────

test('авторизованный: форма открывается и закрывается крестиком', async ({ page }) => {
  await page.request.post('/api/test/session', {
    data: { email: TEST_EMAIL, name: TEST_NAME },
  })
  await page.goto('/')
  await waitAndCloseContactsForm(page)

  const btn = page.getByRole('button', { name: /предложить книгу/i }).first()
  await btn.click()

  const submitDialog = page.getByRole('dialog')
  await expect(submitDialog).toBeVisible()
  await expect(page.locator('#sb-title')).toBeVisible()

  // Закрыть крестиком (aria-label="Закрыть")
  await page.getByRole('button', { name: 'Закрыть', exact: true }).first().click()
  await expect(submitDialog).not.toBeVisible()
})

test('авторизованный: форма закрывается клавишей Escape', async ({ page }) => {
  await page.request.post('/api/test/session', {
    data: { email: TEST_EMAIL, name: TEST_NAME },
  })
  await page.goto('/')
  await waitAndCloseContactsForm(page)

  const btn = page.getByRole('button', { name: /предложить книгу/i }).first()
  await btn.click()
  await expect(page.getByRole('dialog')).toBeVisible()

  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('авторизованный: форма закрывается кликом по оверлею', async ({ page }) => {
  await page.request.post('/api/test/session', {
    data: { email: TEST_EMAIL, name: TEST_NAME },
  })
  await page.goto('/')
  await waitAndCloseContactsForm(page)

  const btn = page.getByRole('button', { name: /предложить книгу/i }).first()
  await btn.click()
  await expect(page.getByRole('dialog')).toBeVisible()

  // Клик по оверлею (за пределами диалога)
  await page.mouse.click(5, 5)
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

// ─── Валидация ────────────────────────────────────────────────────────────────

test('валидация: ошибки появляются при отправке пустой формы', async ({ page }) => {
  await page.request.post('/api/test/session', {
    data: { email: TEST_EMAIL, name: TEST_NAME },
  })
  await page.goto('/')
  await waitAndCloseContactsForm(page)

  const btn = page.getByRole('button', { name: /предложить книгу/i }).first()
  await btn.click()
  await expect(page.locator('#sb-title')).toBeVisible()

  // Отправить пустую форму
  await page.click('button[type="submit"]')

  // Три ошибки «Обязательное поле»
  const errors = page.getByText('Обязательное поле')
  await expect(errors).toHaveCount(3)
})

test('валидация: ошибка появляется при уходе из обязательного поля', async ({ page }) => {
  await page.request.post('/api/test/session', {
    data: { email: TEST_EMAIL, name: TEST_NAME },
  })
  await page.goto('/')
  await waitAndCloseContactsForm(page)

  const btn = page.getByRole('button', { name: /предложить книгу/i }).first()
  await btn.click()
  await expect(page.locator('#sb-title')).toBeVisible()

  // Нажать Tab, не вводя ничего — должна появиться ошибка для title
  await page.locator('#sb-title').click()
  await page.locator('#sb-title').blur()

  await expect(page.getByText('Обязательное поле').first()).toBeVisible()
})

test('валидация: ошибки исчезают после заполнения полей', async ({ page }) => {
  await page.request.post('/api/test/session', {
    data: { email: TEST_EMAIL, name: TEST_NAME },
  })
  await page.goto('/')
  await waitAndCloseContactsForm(page)

  const btn = page.getByRole('button', { name: /предложить книгу/i }).first()
  await btn.click()
  await expect(page.locator('#sb-title')).toBeVisible()

  // Вызвать ошибку
  await page.click('button[type="submit"]')
  await expect(page.getByText('Обязательное поле').first()).toBeVisible()

  // Заполнить поле — ошибка должна уйти
  await page.fill('#sb-title', 'Преступление и наказание')
  await page.locator('#sb-title').blur()
  // Ошибок должно стать 2 (author и whyRead)
  await expect(page.getByText('Обязательное поле')).toHaveCount(2)
})

// ─── Успешная отправка ────────────────────────────────────────────────────────

test('успешная отправка: форма показывает подтверждение', async ({ page }) => {
  const sessionRes = await page.request.post('/api/test/session', {
    data: { email: TEST_EMAIL, name: TEST_NAME },
  })
  expect(sessionRes.ok()).toBeTruthy()
  await page.goto('/')
  await waitAndCloseContactsForm(page)

  const btn = page.getByRole('button', { name: /предложить книгу/i }).first()
  await btn.click()
  await expect(page.locator('#sb-title')).toBeVisible()

  // Заполнить обязательные поля
  await page.fill('#sb-title', 'Тестовая книга E2E')
  await page.fill('#sb-author', 'Тестовый Автор')
  await page.fill('#sb-why-read', 'Потому что это e2e-тест формы предложения книги')

  await page.click('button[type="submit"]')

  // Должно появиться подтверждение
  await expect(page.getByText('Заявка принята!')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText(/рассмотрим/i)).toBeVisible()
})

test('успешная отправка: кнопка «Закрыть» в success-стейте закрывает диалог', async ({ page }) => {
  const sessionRes = await page.request.post('/api/test/session', {
    data: { email: TEST_EMAIL, name: TEST_NAME },
  })
  expect(sessionRes.ok()).toBeTruthy()
  await page.goto('/')
  await waitAndCloseContactsForm(page)

  const btn = page.getByRole('button', { name: /предложить книгу/i }).first()
  await btn.click()
  await expect(page.locator('#sb-title')).toBeVisible()

  await page.fill('#sb-title', 'Тестовая книга E2E 2')
  await page.fill('#sb-author', 'Тестовый Автор 2')
  await page.fill('#sb-why-read', 'Тест закрытия формы после успеха')

  await page.click('button[type="submit"]')
  await expect(page.getByText('Заявка принята!')).toBeVisible({ timeout: 10000 })

  // Нажать «Закрыть» (текстовая кнопка в success-стейте, не крестик ✕)
  await page.locator('button', { hasText: 'Закрыть' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

// ─── Опциональные поля ────────────────────────────────────────────────────────

test('опциональные поля: форма принимает полностью заполненную заявку', async ({ page }) => {
  const sessionRes = await page.request.post('/api/test/session', {
    data: { email: TEST_EMAIL, name: TEST_NAME },
  })
  expect(sessionRes.ok()).toBeTruthy()
  await page.goto('/')
  await waitAndCloseContactsForm(page)

  const btn = page.getByRole('button', { name: /предложить книгу/i }).first()
  await btn.click()
  await expect(page.locator('#sb-title')).toBeVisible()

  // Обязательные
  await page.fill('#sb-title', 'Мастер и Маргарита')
  await page.fill('#sb-author', 'Михаил Булгаков')
  await page.fill('#sb-why-read', 'Классика русской литературы, фантастика и сатира')

  // Опциональные
  await page.fill('#sb-pages', '480')
  await page.fill('#sb-published-date', '1967')
  await page.fill('#sb-description', 'Роман о визите дьявола в Москву 1930-х годов')

  await page.click('button[type="submit"]')
  await expect(page.getByText('Заявка принята!')).toBeVisible({ timeout: 10000 })
})
