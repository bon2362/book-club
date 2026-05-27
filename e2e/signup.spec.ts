import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

const TEST_EMAIL = 'e2e-signup@test.invalid'
const TEST_NAME = 'E2E Signup User'
const TEST_CONTACT = '@e2e_test_user'

test.beforeEach(async () => {
  await epic('Авторизация')
  await feature('Регистрация')
})

test.beforeEach(async ({ page }) => {
  await page.request.post('/api/test/session', {
    data: { email: TEST_EMAIL, name: TEST_NAME },
  })
})

test.afterEach(async ({ page }) => {
  await page.request.delete('/api/test/session', {
    data: { email: TEST_EMAIL },
  })
})

test('новый пользователь заполняет профиль и записывается на книгу', async ({ page, createTestBook }) => {
  // Книга специально создаётся под этот тест — гарантирует, что toggleBtn
  // ниже сработает на нашей карточке, а не на какой-нибудь шаренной.
  const book = await createTestBook({ title: `E2E Signup Book ${test.info().testId}` })

  await page.goto('/')

  // При первом входе автоматически открывается форма профиля (ContactsForm)
  await expect(page.getByLabel(/имя/i)).toBeVisible()

  // Заполняем профиль
  await page.getByLabel(/имя/i).fill(TEST_NAME)
  await page.getByLabel(/telegram/i).fill(TEST_CONTACT)
  await page.getByRole('button', { name: /сохранить/i }).click()

  // Форма профиля закрылась
  await expect(page.getByLabel(/имя/i)).not.toBeVisible()

  await page.reload()
  await page.waitForLoadState('networkidle')

  const me = await page.request.get('/api/me')
  expect(me.ok()).toBeTruthy()
  const meData = await me.json()
  expect(meData.user.name).toBe(TEST_NAME)
  expect(meData.user.contacts).toBe(TEST_CONTACT)
  expect(meData.user.authProvider).toBe('email')
  expect(meData.user.lastSignInAt).toBeTruthy()

  // Закрываем блок "О клубе" если мешает
  const closeAbout = page.getByTitle('Скрыть')
  if (await closeAbout.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeAbout.click()
  }

  // Записываемся именно на свою книгу — ищем её карточку по уникальному title
  const ourBook = page.locator('article').filter({ hasText: book.title })
  await ourBook.getByRole('button', { name: /хочу читать/i }).click()
  await expect(ourBook.getByRole('button', { name: /вы записаны/i })).toBeVisible()

  await expect.poll(async () => {
    const userState = await (await page.request.get(`/api/test/user?email=${encodeURIComponent(TEST_EMAIL)}`)).json()
    return userState.signupBookIds
  }).toContain(book.id)
})

test('повторный submit заменяет список книг, а не добавляет к старому', async ({ page, createTestBook }) => {
  const book1 = await createTestBook({ title: `E2E Signup A ${test.info().testId}` })
  const book2 = await createTestBook({ title: `E2E Signup B ${test.info().testId}` })
  const book3 = await createTestBook({ title: `E2E Signup C ${test.info().testId}` })

  await page.goto('/')
  await expect(page.getByLabel(/имя/i)).toBeVisible()
  await page.getByLabel(/имя/i).fill(TEST_NAME)
  await page.getByLabel(/telegram/i).fill(TEST_CONTACT)
  await page.getByRole('button', { name: /сохранить/i }).click()
  await expect(page.getByLabel(/имя/i)).not.toBeVisible()

  const card1 = page.locator('article').filter({ hasText: book1.title })
  const card2 = page.locator('article').filter({ hasText: book2.title })
  const card3 = page.locator('article').filter({ hasText: book3.title })

  await card1.getByRole('button', { name: /хочу читать/i }).click()
  await card2.getByRole('button', { name: /хочу читать/i }).click()

  await expect.poll(async () => {
    const userState = await (await page.request.get(`/api/test/user?email=${encodeURIComponent(TEST_EMAIL)}`)).json()
    return (userState.signupBookIds as string[]).sort()
  }).toEqual([book1.id, book2.id].sort())

  await card2.getByRole('button', { name: /вы записаны/i }).click()
  await card3.getByRole('button', { name: /хочу читать/i }).click()

  await expect.poll(async () => {
    const userState = await (await page.request.get(`/api/test/user?email=${encodeURIComponent(TEST_EMAIL)}`)).json()
    return (userState.signupBookIds as string[]).sort()
  }).toEqual([book1.id, book3.id].sort())

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(card1.getByRole('button', { name: /вы записаны/i })).toBeVisible()
  await expect(card3.getByRole('button', { name: /вы записаны/i })).toBeVisible()

  const userState = await (await page.request.get(`/api/test/user?email=${encodeURIComponent(TEST_EMAIL)}`)).json()
  expect((userState.signupBookIds as string[]).sort()).toEqual([book1.id, book3.id].sort())
})

test('приоритеты сохраняются и после reload читаются по bookId', async ({ page, createTestBook }) => {
  const book1 = await createTestBook({ title: `E2E Prio A ${test.info().testId}` })
  const book3 = await createTestBook({ title: `E2E Prio B ${test.info().testId}` })

  await page.goto('/')
  await expect(page.getByLabel(/имя/i)).toBeVisible()
  await page.getByLabel(/имя/i).fill(TEST_NAME)
  await page.getByLabel(/telegram/i).fill(TEST_CONTACT)
  await page.getByRole('button', { name: /сохранить/i }).click()
  await expect(page.getByLabel(/имя/i)).not.toBeVisible()

  const card1 = page.locator('article').filter({ hasText: book1.title })
  const card3 = page.locator('article').filter({ hasText: book3.title })
  await card1.getByRole('button', { name: /хочу читать/i }).click()
  await card3.getByRole('button', { name: /хочу читать/i }).click()

  await expect.poll(async () => {
    const userState = await (await page.request.get(`/api/test/user?email=${encodeURIComponent(TEST_EMAIL)}`)).json()
    return (userState.signupBookIds as string[]).sort()
  }).toEqual([book1.id, book3.id].sort())

  const savePriorities = await page.request.put('/api/priorities', {
    data: { bookIds: [book3.id, book1.id] },
  })
  expect(savePriorities.ok()).toBeTruthy()

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle')
  await page.getByRole('button', { name: TEST_NAME }).click()
  const dialog = page.getByRole('dialog', { name: /личный кабинет/i })
  await expect(dialog).toBeVisible()

  await expect.poll(async () =>
    dialog.getByTestId('priority-book-row').evaluateAll(rows =>
      rows.map(row => row.getAttribute('data-book-id'))
    )
  ).toEqual([book3.id, book1.id])
})
