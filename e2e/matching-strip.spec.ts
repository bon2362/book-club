import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

// Без контактов у пользователя главная сама открывает ContactsForm, и её оверлей
// перехватывает клики по полосе. Открывается она после гидрации, поэтому тест
// падал не всегда — только когда JS успевал загрузиться раньше клика.
const withContacts = () => ({ telegramUsername: `e2e_strip_${Math.random().toString(36).slice(2, 10)}` })

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
  await loginAsUser(withContacts())
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

test('новый сезон возвращает полосу, даже если прошлый закрывали', { tag: '@matching-golden' }, async ({
  page,
  createMatchingSession,
  dbExec,
  loginAsUser,
}) => {
  const first = await createMatchingSession()
  await loginAsUser(withContacts())
  await page.goto('/')

  const strip = page.locator('.nd-matching-strip')
  await strip.getByRole('button', { name: 'Скрыть полосу матчинга' }).click()
  await page.reload()
  await expect(strip).toHaveCount(0)

  // Закрытие хранится как id сессии, а не как флаг: следующий подбор обязан
  // вернуть вход, иначе однажды закрывший полосу останется без него совсем.
  await dbExec('update matching_sessions set status = $1 where id = $2', ['closed', first.id])
  await createMatchingSession({ name: `E2E Matching next ${Date.now()}` })
  await page.goto('/')
  await expect(strip).toBeVisible()
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
  await loginAsUser(withContacts())
  await page.goto('/')
  await expect(page.locator('.nd-matching-strip')).toHaveCount(0)
})
