import { test, expect } from './fixtures'
import { waitForHydration } from './helpers'
import { epic, feature } from 'allure-js-commons'

// Без контактов у пользователя главная сама открывает ContactsForm, и её оверлей
// перехватывает клики по полосе. Форма появляется только после гидрации, поэтому
// на медленном dev-сервере тест проходил, а на prod-сборке в CI — падал.
// telegramUsername в /api/test/session не помогает: контакт из него пишется
// только для provider=telegram, а loginAsUser входит через email.
async function loginWithContacts(
  loginAsUser: () => Promise<{ userId: string }>,
  dbExec: (sql: string, params?: unknown[]) => Promise<unknown>,
) {
  const user = await loginAsUser()
  await dbExec('update "user" set contacts = $1 where id = $2', ['@e2e_matching_strip', user.userId])
  return user
}

test.beforeEach(async () => {
  await epic('UI')
  await feature('Вход в матчинг с главной')
})

test('вошедший участник видит полосу открытого матчинга, переходит по ней и сохраняет закрытие', { tag: '@matching-golden' }, async ({
  page,
  createMatchingSession,
  dbExec,
  loginAsUser,
}) => {
  await createMatchingSession()
  await loginWithContacts(loginAsUser, dbExec)
  await page.goto('/')

  const strip = page.locator('.nd-matching-strip')
  await expect(strip).toBeVisible()
  await Promise.all([
    page.waitForURL(/\/matching/),
    strip.getByRole('link', { name: /перейти в матчинг/i }).click(),
  ])

  await page.goto('/')
  await waitForHydration(page)
  await strip.getByRole('button', { name: 'Скрыть полосу матчинга' }).click()
  await expect(strip).toHaveCount(0)
  await page.reload()
  await waitForHydration(page)
  await expect(strip).toHaveCount(0)
})

test('новый сезон возвращает полосу, даже если прошлый закрывали', { tag: '@matching-golden' }, async ({
  page,
  createMatchingSession,
  dbExec,
  loginAsUser,
}) => {
  const first = await createMatchingSession()
  await loginWithContacts(loginAsUser, dbExec)
  await page.goto('/')
  await waitForHydration(page)

  const strip = page.locator('.nd-matching-strip')
  await strip.getByRole('button', { name: 'Скрыть полосу матчинга' }).click()
  await page.reload()
  await waitForHydration(page)
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
  await waitForHydration(page)
  await expect(page.locator('.nd-matching-strip')).toHaveCount(0)

  await dbExec('update matching_sessions set status = $1 where id = $2', ['closed', session.id])
  await loginWithContacts(loginAsUser, dbExec)
  await page.goto('/')
  await waitForHydration(page)
  await expect(page.locator('.nd-matching-strip')).toHaveCount(0)
})
