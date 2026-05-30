import { test, expect, type Page } from './fixtures'

async function joinSessionAndAddBooks(page: Page, sessionId: string, bookIds: string[]) {
  const joinRes = await page.request.post(`/api/matching/sessions/${sessionId}/join`)
  if (!joinRes.ok()) {
    throw new Error(`POST /api/matching/sessions/${sessionId}/join failed: ${joinRes.status()} ${await joinRes.text()}`)
  }
  const joinBody = (await joinRes.json()) as { pseudonym: string }

  for (const bookId of bookIds) {
    const addRes = await page.request.post('/api/matching/books', { data: { bookId } })
    if (!addRes.ok()) {
      throw new Error(`POST /api/matching/books failed: ${addRes.status()} ${await addRes.text()}`)
    }
  }

  return joinBody.pseudonym
}

test('matching shows reader circles, move hints, and full book details modal', async ({
  page,
  createMatchingSession,
  createTestBook,
  loginAsUser,
}) => {
  const session = await createMatchingSession({ targetGroupSize: 3 })
  const circleBook = await createTestBook({
    title: `E2E Circle Book ${test.info().testId}`,
    author: 'Circle Author',
    description: 'Описание книги для полного попапа',
    tags: ['политэкономия'],
    textUrl: 'https://example.com/text',
    whyRead: 'Проверяем секцию почему предлагаю читать',
    recommendationLink: 'Рецензия клуба https://example.com/recommendation',
  })
  const moveBook = await createTestBook({
    title: `E2E Move Book ${test.info().testId}`,
    author: 'Move Author',
    description: 'Описание книги, которая замыкает круг',
    tags: ['самоуправление'],
    textUrl: 'https://example.com/move-text',
    whyRead: 'Эта книга проверяет попап из Моих ходов',
    recommendationLink: 'Разбор https://example.com/move-recommendation',
  })

  await loginAsUser({ name: 'E2E Reader One' })
  const firstPseudonym = await joinSessionAndAddBooks(page, session.id, [circleBook.id, moveBook.id])

  await loginAsUser({ name: 'E2E Reader Two' })
  const secondPseudonym = await joinSessionAndAddBooks(page, session.id, [circleBook.id, moveBook.id])

  await loginAsUser({ name: 'E2E Reader Three' })
  const thirdPseudonym = await joinSessionAndAddBooks(page, session.id, [circleBook.id])

  await page.goto('/matching')
  await expect(page.getByRole('heading', { name: 'Читательские круги' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Мои ходы' })).toBeVisible()
  await expect(page.getByText('Добавь книгу и круг замкнется')).toBeVisible()

  await expect(page.getByRole('button', { name: circleBook.title, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: moveBook.title, exact: true })).toBeVisible()
  await expect(page.getByText('Уже записались:')).toBeVisible()

  await page.getByRole('button', { name: moveBook.title, exact: true }).click()
  let dialog = page.getByRole('dialog', { name: moveBook.title })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Почему предлагаю читать')
  await expect(dialog).toContainText('Эта книга проверяет попап из Моих ходов')
  await expect(dialog.getByRole('link', { name: 'Текст' })).toHaveAttribute('href', 'https://example.com/move-text')
  await expect(dialog.getByRole('link', { name: 'Разбор' })).toHaveAttribute('href', 'https://example.com/move-recommendation')
  await expect(dialog).toContainText('самоуправление')
  await dialog.getByRole('button', { name: 'Закрыть' }).click()
  await expect(dialog).not.toBeVisible()

  await page.getByRole('button', { name: circleBook.title, exact: true }).click()
  dialog = page.getByRole('dialog', { name: circleBook.title })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Записались на книгу:')
  await expect(dialog).toContainText(firstPseudonym)
  await expect(dialog).toContainText(secondPseudonym)
  await expect(dialog).toContainText(thirdPseudonym)
  await expect(dialog).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i)
  await page.goto('about:blank')
})
