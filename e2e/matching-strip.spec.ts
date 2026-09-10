import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

test.beforeEach(async () => {
  await epic('UI')
  await feature('Вход в матчинг с главной')
})

test('вошедший участник видит полосу открытого матчинга, переходит по ней и сохраняет закрытие', { tag: '@matching-golden' }, async ({
  page,
  createMatchingSession,
  loginAsUser,
}) => {
  await createMatchingSession()
  await loginAsUser()
  await page.goto('/')

  const strip = page.locator('.nd-matching-strip')
  await expect(strip).toBeVisible()
  await Promise.all([
    page.waitForURL(/\/matching/),
    strip.getByRole('link', { name: /перейти в матчинг/i }).click(),
  ])

  await page.goto('/')
  await strip.getByRole('button', { name: 'Скрыть полосу матчинга' }).click()
  await expect(strip).toHaveCount(0)
  await page.reload()
  await expect(strip).toHaveCount(0)
})

test('гость и вошедший участник при закрытой сессии не видят полосу', { tag: '@matching-golden' }, async ({
  page,
  createMatchingSession,
  dbExec,
  loginAsUser,
}) => {
  const session = await createMatchingSession()
  await page.goto('/')
  await expect(page.locator('.nd-matching-strip')).toHaveCount(0)

  await dbExec('update matching_sessions set status = $1 where id = $2', ['closed', session.id])
  await loginAsUser()
  await page.goto('/')
  await expect(page.locator('.nd-matching-strip')).toHaveCount(0)
})
