/**
 * Диагностический тест: проверяет отправку формы «Предложить книгу».
 * Запускать вручную: npx playwright test e2e/debug-submission.spec.ts --headed
 */
import { test, expect } from '@playwright/test'

test('диагностика: отправка формы предложения книги', async ({ page }) => {
  // 1. Создать тестовую сессию
  const sessionRes = await page.request.post('/api/test/session', {
    data: { email: 'debug@test.com', name: 'Debug User' },
  })
  console.log('session status:', sessionRes.status())
  console.log('session body:', await sessionRes.text())

  // 2. Перехватывать все запросы к /api/submissions
  const apiResponses: { status: number; body: string }[] = []
  page.on('response', async (response) => {
    if (response.url().includes('/api/submissions')) {
      const body = await response.text().catch(() => '(error reading body)')
      apiResponses.push({ status: response.status(), body })
      console.log('API response status:', response.status())
      console.log('API response body:', body)
    }
  })

  // 3. Открыть страницу, дождаться гидрации
  await page.goto('/')
  await page.waitForLoadState('networkidle')

  // 4. Закрыть ContactsForm если появилась
  const dialog = page.getByRole('dialog')
  if (await dialog.isVisible({ timeout: 1000 }).catch(() => false)) {
    await page.keyboard.press('Escape')
    await expect(dialog).not.toBeVisible({ timeout: 5000 })
  }

  // 5. Открыть форму
  const submitBtn = page.getByRole('button', { name: /предложить книгу/i }).first()
  await submitBtn.click()
  await page.waitForSelector('[role="dialog"]')

  // 6. Заполнить форму
  await page.fill('#sb-title', 'Тестовая книга debug')
  await page.fill('#sb-author', 'Тестовый автор')
  await page.fill('#sb-why-read', 'Потому что это диагностический тест')

  // 7. Отправить
  await page.click('button[type="submit"]')

  // 8. Ждать результата
  await page.waitForTimeout(3000)

  // 9. Проверить что показывается на экране
  const dialogText = await page.locator('[role="dialog"]').innerText().catch(() => '(dialog closed)')
  console.log('Dialog text after submit:', dialogText)

  // 10. Вывести все API ответы
  console.log('All API responses:', JSON.stringify(apiResponses, null, 2))

  // 11. Очистить тестового пользователя
  await page.request.delete('/api/test/session', {
    data: { email: 'debug@test.com' },
  })
})
