import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

const ADMIN_EMAIL = 'e2e-admin-delete-test@test.invalid'
const ADMIN_NAME = 'E2E Admin'
const VICTIM_EMAIL = 'e2e-delete-victim@test.invalid'
const VICTIM_NAME = 'E2E Жертва Удаления'
const VICTIM_CONTACT = '@e2e_delete_victim'
const VICTIM_ID = `test:${VICTIM_EMAIL}`

test.describe('Удаление пользователя в админке', () => {
  test.setTimeout(120_000) // Админка и e2e setup могут быть медленными в CI

  let victimBookId = ''

  test.beforeEach(async ({ page, createTestBook }) => {
    await epic('Администрирование')
    await feature('Удаление пользователей')

    // 1. Книга, на которую запишется жертва (фикстура удалит в teardown)
    const book = await createTestBook({ title: `E2E Victim Book ${Date.now()}` })
    victimBookId = book.id

    // 2. Создаём жертву в БД
    await page.request.post('/api/test/session', {
      data: { email: VICTIM_EMAIL, name: VICTIM_NAME },
    })
    // 3. Пишем signup жертвы напрямую в signup_books
    await page.request.post('/api/test/signup', {
      data: { userId: VICTIM_ID, name: VICTIM_NAME, email: VICTIM_EMAIL, contacts: VICTIM_CONTACT, selectedBookIds: [victimBookId] },
    })

    // 4. Переключаемся на сессию администратора
    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })
  })

  test.afterEach(async ({ page }) => {
    // Чистим signup_books запись жертвы
    await page.request.delete('/api/test/signup', {
      data: { userId: VICTIM_ID },
    })
    // Чистим обоих пользователей из БД
    await page.request.delete('/api/test/session', {
      data: { email: ADMIN_EMAIL },
    })
    await page.request.delete('/api/test/session', {
      data: { email: VICTIM_EMAIL },
    })
  })

  test('удалённый пользователь не появляется после перезагрузки страницы', async ({ page }) => {
    const beforeDelete = await page.request.get(`/api/test/user?email=${encodeURIComponent(VICTIM_EMAIL)}`)
    const beforeDeleteData = await beforeDelete.json()
    expect(beforeDeleteData.exists).toBe(true)
    expect(beforeDeleteData.signupBookCount).toBe(1)

    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    // Вкладка "Участники" открыта по умолчанию — ищем жертву в таблице
    await expect(page.getByText(VICTIM_NAME)).toBeVisible()

    // Принимаем confirm-диалог перед кликом
    page.on('dialog', dialog => dialog.accept())

    // Находим строку жертвы, открываем карточку и удаляем из drawer
    const victimRow = page.locator('tr').filter({ hasText: VICTIM_NAME })
    await victimRow.click()
    await expect(page.getByRole('dialog')).toContainText(VICTIM_NAME)
    await page.getByRole('dialog').getByRole('button', { name: /удалить пользователя/i }).click()

    // Жертва исчезла из таблицы (локальный стейт)
    await expect(page.locator('tr').filter({ hasText: VICTIM_NAME })).toHaveCount(0)

    const afterDelete = await page.request.get(`/api/test/user?email=${encodeURIComponent(VICTIM_EMAIL)}`)
    const afterDeleteData = await afterDelete.json()
    expect(afterDeleteData.exists).toBe(false)
    expect(afterDeleteData.accountCount).toBe(0)
    expect(afterDeleteData.sessionCount).toBe(0)
    expect(afterDeleteData.signupBookCount).toBe(0)

    // Перезагружаем страницу — ключевая проверка: данные читаются заново из Sheets
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Жертва не должна появиться снова
    await expect(page.locator('tr').filter({ hasText: VICTIM_NAME })).toHaveCount(0)
  })
})
