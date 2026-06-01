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
  if (bookIds.length > 0) {
    const rankRes = await page.request.patch('/api/matching/priorities', { data: { bookIds } })
    if (!rankRes.ok()) {
      throw new Error(`PATCH /api/matching/priorities failed: ${rankRes.status()} ${await rankRes.text()}`)
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
  const session = await createMatchingSession({ minGroupSize: 3, maxGroupSize: 3 })
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
  const firstPseudonym = await joinSessionAndAddBooks(page, session.id, [moveBook.id, circleBook.id])

  await loginAsUser({ name: 'E2E Reader Two' })
  const secondPseudonym = await joinSessionAndAddBooks(page, session.id, [moveBook.id, circleBook.id])

  await loginAsUser({ name: 'E2E Reader Three' })
  const thirdPseudonym = await joinSessionAndAddBooks(page, session.id, [circleBook.id])

  await page.goto('/matching')
  await expect(page.getByRole('heading', { name: 'Читательские круги' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Мои ходы' })).toBeVisible()
  await expect(page.getByText('Добавь книгу и соберется новый сценарий')).toBeVisible()

  const circlesPanel = page.getByTestId('matching-reader-circles-panel')
  const movesPanel = page.getByTestId('matching-my-moves-panel')
  const catalogMine = page.getByTestId('matching-catalog-mine')
  await expect(circlesPanel.getByRole('button', { name: circleBook.title, exact: true })).toBeVisible()
  await expect(movesPanel.getByRole('button', { name: moveBook.title, exact: true }).first()).toBeVisible()
  await expect(movesPanel.getByText('Лучший ход')).toBeVisible()
  await expect(movesPanel.getByText('Кому это поможет')).toBeVisible()
  await expect(movesPanel.getByText('очень хочу').first()).toBeVisible()
  await expect(movesPanel.getByText('После добавления:')).toBeVisible()
  const moveCardPreview = movesPanel.locator('li').filter({ hasText: moveBook.title }).first()
  await moveCardPreview.hover()
  await expect(movesPanel.getByText('лучшим сценарием станет')).toBeVisible()
  await expect(moveCardPreview.getByRole('button', { name: moveBook.title, exact: true }).nth(1)).toBeVisible()
  await expect(circlesPanel.getByText(firstPseudonym).first()).toHaveCSS('color', 'rgb(192, 96, 58)')

  await movesPanel.getByRole('button', { name: moveBook.title, exact: true }).first().click()
  let dialog = page.getByRole('dialog', { name: moveBook.title })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Почему предлагаю читать')
  await expect(dialog).toContainText('Эта книга проверяет попап из Моих ходов')
  await expect(dialog.getByRole('link', { name: 'Текст' })).toHaveAttribute('href', 'https://example.com/move-text')
  await expect(dialog.getByRole('link', { name: 'Разбор' })).toHaveAttribute('href', 'https://example.com/move-recommendation')
  await expect(dialog).toContainText('самоуправление')
  await dialog.getByRole('button', { name: 'Закрыть' }).click()
  await expect(dialog).not.toBeVisible()

  await circlesPanel.getByRole('button', { name: circleBook.title, exact: true }).click()
  dialog = page.getByRole('dialog', { name: circleBook.title })
  await expect(dialog).toBeVisible()
  await expect(dialog).toContainText('Записались на книгу:')
  await expect(dialog).toContainText(firstPseudonym)
  await expect(dialog).toContainText(secondPseudonym)
  await expect(dialog).toContainText(thirdPseudonym)
  await expect(dialog).toContainText('очень хочу')
  await expect(dialog).not.toContainText(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i)

  await dialog.getByRole('button', { name: 'Закрыть' }).click()
  await expect(dialog).not.toBeVisible()

  const moveCard = page
    .locator('li')
    .filter({ hasText: moveBook.title })
    .filter({ hasText: 'Кому это поможет' })
    .first()
  const addMoveResponse = page.waitForResponse(
    r => r.url().includes('/api/matching/books') && r.request().method() === 'POST',
  )
  const addButton = moveCard.getByRole('button', { name: 'Хочу читать' })
  await addButton.hover()
  await expect(moveCard.getByRole('button', { name: 'Хочу читать * на первое место' })).toBeVisible()
  await moveCard.getByRole('button', { name: 'Хочу читать * на первое место' }).click()
  await addMoveResponse

  await expect(page.getByText('Пока нет книг, где ваша заявка изменит лучший сценарий')).toBeVisible()
  await expect(catalogMine).toContainText(moveBook.title, { timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Сценарий 1' })).toBeVisible()
  await expect(page.getByRole('button', { name: moveBook.title, exact: true })).toBeVisible()
  await expect(page.getByText('все 3 участников').first()).toBeVisible()

  await page.goto('about:blank')
})
