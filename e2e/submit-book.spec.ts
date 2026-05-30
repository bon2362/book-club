import { type Page, test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

const TEST_EMAIL = 'e2e-submit@test.invalid'
const TEST_NAME = 'E2E Submit User'
const ADMIN_EMAIL = 'e2e-submit-admin@test.invalid'

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

test.beforeEach(async () => {
  await epic('Каталог книг')
  await feature('Предложить книгу')
})

test.afterEach(async ({ page }) => {
  await page.request.delete('/api/test/session', {
    data: { email: TEST_EMAIL },
  })
  await page.request.delete('/api/test/session', {
    data: { email: ADMIN_EMAIL },
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

// Открытие формы по кнопке + закрытие крестиком и кликом по оверлею.
// Порядок полей, плейсхолдеры, отсутствие «Темы», закрытие по Escape и вся
// валидация обязательных полей покрыты быстрым component-тестом
// components/nd/SubmitBookForm.test.tsx (jsdom) — здесь только то, что требует
// реального браузера: открытие из страницы и закрытие через оверлей.
test('авторизованный: форма открывается по кнопке и закрывается (крестик / оверлей)', async ({ page }) => {
  await page.request.post('/api/test/session', {
    data: { email: TEST_EMAIL, name: TEST_NAME },
  })
  await page.goto('/')
  await waitAndCloseContactsForm(page)

  const btn = page.getByRole('button', { name: /предложить книгу/i }).first()

  // Закрытие крестиком
  await btn.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('#sb-title')).toBeVisible()
  await page.getByRole('button', { name: 'Закрыть', exact: true }).first().click()
  await expect(page.getByRole('dialog')).not.toBeVisible()

  // Закрытие кликом по оверлею (поведение, специфичное для браузера)
  await btn.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.mouse.click(5, 5)
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

// ─── Успешная отправка ────────────────────────────────────────────────────────

// Реальная отправка из браузера (без мока fetch, как в component-тесте):
// заполнить обязательные + опциональные поля → подтверждение → «Закрыть».
// Покрывает прежние «подтверждение», «кнопка Закрыть в success» и
// «полностью заполненная заявка».
test('успешная отправка: полная заявка → подтверждение → закрытие', async ({ page }) => {
  const sessionRes = await page.request.post('/api/test/session', {
    data: { email: TEST_EMAIL, name: TEST_NAME },
  })
  expect(sessionRes.ok()).toBeTruthy()
  await page.goto('/')
  await waitAndCloseContactsForm(page)

  const btn = page.getByRole('button', { name: /предложить книгу/i }).first()
  await btn.click()
  await expect(page.locator('#sb-title')).toBeVisible()

  // Обязательные поля
  await page.fill('#sb-title', 'Мастер и Маргарита')
  await page.fill('#sb-author', 'Михаил Булгаков')
  await page.fill('#sb-why-read', 'Классика русской литературы, фантастика и сатира')

  // Опциональные поля
  await page.fill('#sb-pages', '480')
  await page.fill('#sb-published-date', '1967')
  await page.fill('#sb-description', 'Роман о визите дьявола в Москву 1930-х годов')

  await page.click('button[type="submit"]')

  // Подтверждение
  await expect(page.getByText('Заявка принята!')).toBeVisible({ timeout: 10000 })
  await expect(page.getByText(/рассмотрим/i)).toBeVisible()

  // Кнопка «Закрыть» в success-стейте закрывает диалог
  await page.locator('button', { hasText: 'Закрыть' }).click()
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('одобрение заявки автоматически записывает автора на предложенную книгу', async ({ page }) => {
  const unique = Date.now()
  const title = `E2E Auto Signup ${unique}`
  const userEmail = `e2e-submit-auto-${unique}@test.invalid`
  const userName = `E2E Submit Auto ${unique}`

  try {
    await page.request.post('/api/test/session', {
      data: { email: userEmail, name: userName },
    })

    const submitRes = await page.request.post('/api/submissions', {
      data: {
        title,
        author: 'E2E Автор',
        whyRead: 'Проверяем автозапись автора заявки после одобрения',
      },
    })
    expect(submitRes.ok()).toBeTruthy()
    const submitData = await submitRes.json()

    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: 'E2E Submit Admin', isAdmin: true },
    })
    const approveRes = await page.request.patch(`/api/admin/submissions/${submitData.data.id}`, {
      data: { status: 'approved' },
    })
    expect(approveRes.ok()).toBeTruthy()

    await page.request.post('/api/test/session', {
      data: { email: userEmail, name: userName },
    })
    await page.goto('/')
    await waitAndCloseContactsForm(page)

    const book = page.locator('article').filter({ hasText: title })
    await expect(book.getByRole('button', { name: /записан/i })).toBeVisible({ timeout: 10000 })

    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(book.getByRole('button', { name: /записан/i })).toBeVisible({ timeout: 10000 })

    const userState = await (await page.request.get(`/api/test/user?email=${encodeURIComponent(userEmail)}`)).json()
    expect(userState.signupBooks).toContain(title)
  } finally {
    await page.request.delete('/api/test/session', {
      data: { email: userEmail },
    }).catch(() => {})
  }
})
// «кнопка Закрыть в success» и «полностью заполненная заявка» объединены
// в тест «успешная отправка: полная заявка → подтверждение → закрытие» выше.
