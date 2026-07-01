import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

test.beforeEach(async () => {
  await epic('Матчинг')
  await feature('Auth gate на /matching')
})

test('неавторизованный пользователь видит окно входа на /matching, а не редиректится на /', async ({ page }) => {
  await page.goto('/matching')

  await expect(page).toHaveURL(/\/matching/)
  await expect(page.getByRole('heading', { name: 'Подбор пары' })).toBeVisible()

  const dialog = page.getByRole('dialog', { name: /войти в круг/i })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: /войти через telegram/i })).toBeVisible()
})

test('закрытие окна входа уводит неавторизованного пользователя на главную', async ({ page }) => {
  await page.goto('/matching')

  const dialog = page.getByRole('dialog', { name: /войти в круг/i })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Закрыть' }).click()

  await expect(page).toHaveURL('/')
})
