import { test, expect } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'

const TEST_NAME_BASE = 'E2E Priority Hint'
const TEST_CONTACT_BASE = 'e2e_priority_hint'

let testEmail = ''
let testName = ''
let testContact = ''

test.beforeEach(async ({ page }, testInfo) => {
  await epic('Каталог книг')
  await feature('Приоритеты книг')
  const runId = `${testInfo.workerIndex}-${testInfo.retry}-${Date.now()}`
  testEmail = `e2e-priority-hint-${runId}@test.invalid`
  testName = `${TEST_NAME_BASE} ${runId}`
  testContact = `@${TEST_CONTACT_BASE}_${runId.replace(/[^a-zA-Z0-9_]/g, '_')}`

  await page.request.post('/api/test/session', {
    data: { email: testEmail, name: testName },
  })
})

test.afterEach(async ({ page }) => {
  await page.request.delete('/api/test/session', {
    data: { email: testEmail },
  })
})

// Устанавливает профиль нового пользователя и сбрасывает флаг подсказки
async function setupProfileAndClearHint(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => localStorage.removeItem('hint_priorities_seen'))

  // ContactsForm автоматически открывается для нового пользователя — заполняем первой,
  // потому что её оверлей перехватывает клики по кнопке закрытия блока "О клубе"
  await page.getByLabel(/имя/i).fill(testName)
  await page.getByLabel(/telegram/i).fill(testContact)
  await page.getByRole('button', { name: /сохранить/i }).click()
  await expect(page.getByLabel(/имя/i)).not.toBeVisible()

  const closeAbout = page.getByTitle('Скрыть')
  if (await closeAbout.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeAbout.click()
  }
}

test('тост не появляется после первой книги', async ({ page }) => {
  await setupProfileAndClearHint(page)

  await page.getByRole('button', { name: /хочу читать/i }).first().click()

  await expect(page.getByTestId('priority-hint-toast')).not.toBeVisible()
})

test('тост появляется после второй книги', async ({ page }) => {
  await setupProfileAndClearHint(page)

  const bookButtons = page.getByRole('button', { name: /хочу читать/i })
  await bookButtons.first().click()
  // Ждём подтверждения что первая книга добавлена, прежде чем кликать следующую
  await expect(page.getByRole('button', { name: /вы записаны/i }).first()).toBeVisible()
  await expect(page.getByTestId('priority-hint-toast')).not.toBeVisible()

  // После первого клика кнопка стала "Вы записаны", поэтому .first() снова указывает на следующую книгу
  await bookButtons.first().click()
  await expect(page.getByTestId('priority-hint-toast')).toBeVisible()
  await expect(page.getByTestId('priority-hint-toast')).toContainText('приоритет')
})

test('кнопка ✕ закрывает тост', async ({ page }) => {
  await setupProfileAndClearHint(page)

  const bookButtons = page.getByRole('button', { name: /хочу читать/i })
  await bookButtons.first().click()
  await expect(page.getByRole('button', { name: /вы записаны/i }).first()).toBeVisible()
  await bookButtons.first().click()
  await expect(page.getByTestId('priority-hint-toast')).toBeVisible()

  await page.getByRole('button', { name: /закрыть подсказку/i }).click()
  await expect(page.getByTestId('priority-hint-toast')).not.toBeVisible()
})

test('кнопка «Открыть» закрывает тост и открывает профиль', async ({ page }) => {
  await setupProfileAndClearHint(page)

  const bookButtons = page.getByRole('button', { name: /хочу читать/i })
  await bookButtons.first().click()
  await expect(page.getByRole('button', { name: /вы записаны/i }).first()).toBeVisible()
  await bookButtons.first().click()
  await expect(page.getByTestId('priority-hint-toast')).toBeVisible()

  await page.getByTestId('priority-hint-toast').getByRole('button', { name: /открыть/i }).click()
  await expect(page.getByTestId('priority-hint-toast')).not.toBeVisible()
  await expect(page.getByRole('dialog', { name: /личный кабинет/i })).toBeVisible()
})

test('тост закрывается автоматически через 20 секунд', async ({ page }) => {
  await setupProfileAndClearHint(page)

  const bookButtons = page.getByRole('button', { name: /хочу читать/i })
  await bookButtons.first().click()
  await expect(page.getByRole('button', { name: /вы записаны/i }).first()).toBeVisible()
  await bookButtons.first().click()

  const toast = page.getByTestId('priority-hint-toast')
  await expect(toast).toBeVisible()
  await expect(page.getByTestId('priority-hint-progress')).toBeVisible()

  // Через половину таймера ещё виден
  await page.waitForTimeout(10000)
  await expect(toast).toBeVisible()

  // После полного истечения — скрыт
  await expect(toast).toBeHidden({ timeout: 12000 })
})

test('hover на тост ставит таймер на паузу', async ({ page }) => {
  test.setTimeout(60_000)
  await setupProfileAndClearHint(page)

  const bookButtons = page.getByRole('button', { name: /хочу читать/i })
  await bookButtons.first().click()
  await expect(page.getByRole('button', { name: /вы записаны/i }).first()).toBeVisible()
  await bookButtons.first().click()

  const toast = page.getByTestId('priority-hint-toast')
  await expect(toast).toBeVisible()

  // Удерживаем курсор дольше штатных 20 секунд — тост обязан остаться
  await toast.hover()
  await page.waitForTimeout(21000)
  await expect(toast).toBeVisible()

  // Уводим курсор — таймер возобновляется и тост закрывается
  await page.getByRole('banner').hover()
  await expect(toast).toBeHidden({ timeout: 21000 })
})

test('тост не показывается повторно если флаг уже установлен', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  // Устанавливаем флаг до взаимодействия с книгами
  await page.evaluate(() => localStorage.setItem('hint_priorities_seen', '1'))

  await page.getByLabel(/имя/i).fill(testName)
  await page.getByLabel(/telegram/i).fill(testContact)
  await page.getByRole('button', { name: /сохранить/i }).click()
  await expect(page.getByLabel(/имя/i)).not.toBeVisible()

  const closeAbout = page.getByTitle('Скрыть')
  if (await closeAbout.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeAbout.click()
  }

  const bookButtons = page.getByRole('button', { name: /хочу читать/i })
  await bookButtons.first().click()
  await expect(page.getByRole('button', { name: /вы записаны/i }).first()).toBeVisible()
  await bookButtons.first().click()

  await expect(page.getByTestId('priority-hint-toast')).not.toBeVisible()
})
