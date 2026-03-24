import { test, expect } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'

const ADMIN_EMAIL = 'e2e-admin-delete-test@test.invalid'
const ADMIN_NAME = 'E2E Admin'
const VICTIM_EMAIL = 'e2e-delete-victim@test.invalid'
const VICTIM_NAME = 'E2E Жертва Удаления'
const VICTIM_CONTACT = '@e2e_delete_victim'

test.describe('Удаление пользователя в админке', () => {
  test.setTimeout(120_000) // Google Sheets API may be slow

  test.beforeEach(async ({ page }) => {
    await epic('Администрирование')
    await feature('Удаление пользователей')
    // 1. Создаём жертву в БД
    await page.request.post('/api/test/session', {
      data: { email: VICTIM_EMAIL, name: VICTIM_NAME },
    })
    // 2. Пишем сигнап жертвы напрямую в Google Sheets (обычный /api/signup
    //    пропускает запись в Sheets в NEXTAUTH_TEST_MODE)
    await page.request.post('/api/test/signup', {
      data: { userId: VICTIM_EMAIL, name: VICTIM_NAME, email: VICTIM_EMAIL, contacts: VICTIM_CONTACT, selectedBooks: [] },
    })

    // 3. Переключаемся на сессию администратора
    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })
  })

  test.afterEach(async ({ page }) => {
    // Помечаем запись жертвы в Sheets как TO DELETE (cleanup)
    await page.request.delete('/api/test/signup', {
      data: { userId: VICTIM_EMAIL },
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
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    // Вкладка "Участники" открыта по умолчанию — ищем жертву в таблице
    await expect(page.getByText(VICTIM_NAME)).toBeVisible()

    // Принимаем confirm-диалог перед кликом
    page.on('dialog', dialog => dialog.accept())

    // Находим строку жертвы и кликаем "Удалить"
    const victimRow = page.locator('tr').filter({ hasText: VICTIM_NAME })
    await victimRow.getByTitle('Удалить пользователя').click()

    // Жертва исчезла из таблицы (локальный стейт)
    await expect(page.getByText(VICTIM_NAME)).not.toBeVisible()

    // Перезагружаем страницу — ключевая проверка: данные читаются заново из Sheets
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Жертва не должна появиться снова
    await expect(page.getByText(VICTIM_NAME)).not.toBeVisible()
  })
})
