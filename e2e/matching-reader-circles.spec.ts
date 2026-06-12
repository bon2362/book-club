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

test('matching shows welcome screen until the reader explicitly joins', async ({
  page,
  createMatchingSession,
  loginAsUser,
}) => {
  const session = await createMatchingSession({ minGroupSize: 3, maxGroupSize: 3 })
  await loginAsUser({ name: 'E2E Welcome Reader' })

  await page.goto('/matching')
  await expect(page.getByRole('heading', { name: 'Добро пожаловать' })).toBeVisible()
  await expect(page.getByText('Ваш ник')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Войти' })).toBeVisible()

  // Ячейка-иллюстрация ника рендерится: либо фото (img), либо буква-глиф
  const illustration = page.getByTestId('welcome-illustration')
  await expect(illustration).toBeVisible()
  const hasImg = await illustration.locator('img').count()
  const hasGlyph = await page.getByTestId('welcome-species-glyph').count()
  expect(hasImg + hasGlyph).toBeGreaterThan(0)

  // смена ника на другой случайный: меняется на месте и сохраняется после перезагрузки
  const nickValue = page.getByTestId('welcome-pseudonym')
  const beforeNick = (await nickValue.textContent())?.trim() ?? ''
  let afterNick = beforeNick
  for (let attempt = 0; attempt < 5; attempt++) {
    const rerollResponsePromise = page.waitForResponse((response) => (
      response.url().includes(`/api/matching/sessions/${session.id}/pseudonym`)
      && response.request().method() === 'POST'
    ))
    await page.getByTestId('welcome-reroll').click()
    const rerollResponse = await rerollResponsePromise
    expect(rerollResponse.ok()).toBe(true)
    const body = await rerollResponse.json() as { pseudonym: string }
    afterNick = body.pseudonym
    await expect(nickValue).toHaveText(afterNick)
    if (afterNick !== beforeNick) break
  }
  await expect(nickValue).not.toHaveText(beforeNick)
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('welcome-pseudonym')).toHaveText(afterNick)

  await expect(page.getByRole('heading', { name: 'Читательские круги' })).not.toBeVisible()

  await page.getByRole('button', { name: 'Войти' }).click()
  await expect(page.getByRole('heading', { name: 'Читательские круги' })).toBeVisible({ timeout: 15_000 })

  // Присвоенный после входа ник должен совпадать с тем, что был показан на welcome
  // (а не оказаться случайным — защита от рассинхрона брони и join'а)
  const identity = new RegExp(`Вы\\s*—\\s*${afterNick}`)
  await expect(page.getByText(identity)).toBeVisible()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Добро пожаловать' })).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Читательские круги' })).toBeVisible()
  // ...и сохраняется после перезагрузки
  await expect(page.getByText(identity)).toBeVisible()
})

test('matching catalog does not show the rank nudge banner', async ({
  page,
  createMatchingSession,
  createTestBook,
  loginAsUser,
}) => {
  const session = await createMatchingSession({ minGroupSize: 3, maxGroupSize: 3 })
  const book = await createTestBook({
    title: `E2E Unranked Book ${test.info().testId}`,
    author: 'Nudge Author',
  })

  await loginAsUser({ name: 'E2E Nudge Reader' })
  await page.request.post(`/api/matching/sessions/${session.id}/join`)
  await page.request.post('/api/matching/books', { data: { bookId: book.id } })

  await page.goto('/matching')
  await expect(page.getByTestId('matching-catalog-panel')).toBeVisible()
  await expect(page.getByText('Расставь ранги, чтобы улучшить выбор сценариев')).not.toBeVisible()
})

test('matching shows reader circles, move hints, and full book details modal', async ({
  page,
  createMatchingSession,
  createTestBook,
  loginAsUser,
}) => {
  test.setTimeout(120_000)
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
  const fillerBookA = await createTestBook({
    title: `E2E Filler A ${test.info().testId}`,
    author: 'Filler Author',
    description: 'Книга-заполнитель для рангов',
  })
  const fillerBookB = await createTestBook({
    title: `E2E Filler B ${test.info().testId}`,
    author: 'Filler Author',
    description: 'Книга-заполнитель для рангов',
  })

  await loginAsUser({ name: 'E2E Reader One' })
  const firstPseudonym = await joinSessionAndAddBooks(page, session.id, [
    moveBook.id,
    fillerBookA.id,
    fillerBookB.id,
    circleBook.id,
  ])

  await loginAsUser({ name: 'E2E Reader Two' })
  const secondPseudonym = await joinSessionAndAddBooks(page, session.id, [
    moveBook.id,
    fillerBookA.id,
    fillerBookB.id,
    circleBook.id,
  ])

  await loginAsUser({ name: 'E2E Reader Three' })
  const thirdPseudonym = await joinSessionAndAddBooks(page, session.id, [circleBook.id])

  await page.goto('/matching')
  await expect(page.getByRole('heading', { name: 'Читательские круги' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Мои ходы' })).toBeVisible()
  await expect(page.getByText('Эти книги меняют лучший расклад.')).toBeVisible()

  const circlesPanel = page.getByTestId('matching-reader-circles-panel')
  const movesPanel = page.getByTestId('matching-my-moves-panel')
  const catalogMine = page.getByTestId('matching-catalog-mine')
  await expect(circlesPanel).toBeVisible({ timeout: 20_000 })
  await expect(circlesPanel.getByRole('button', { name: circleBook.title, exact: true })).toBeVisible({ timeout: 20_000 })
  await expect(movesPanel.getByRole('button', { name: moveBook.title, exact: true }).first()).toBeVisible({ timeout: 20_000 })
  await expect(movesPanel.getByText('Лучший ход')).not.toBeVisible()
  await expect(movesPanel.getByText('Кому это поможет')).not.toBeVisible()
  await expect(movesPanel.getByText('← смотри слева, каким станет расклад').first()).not.toBeVisible()
  await expect(movesPanel.getByText('очень хочу').first()).toBeVisible()
  await expect(movesPanel.getByText('После добавления:')).not.toBeVisible()
  const moveCardPreview = movesPanel.locator('li').filter({ hasText: moveBook.title }).first()
  await moveCardPreview.hover()
  await expect(moveCardPreview.getByText('← смотри слева, каким станет расклад')).toBeVisible()
  await expect(circlesPanel.getByText('Нашёлся расклад лучше')).toBeVisible()
  await expect(circlesPanel.getByText(`«${moveBook.title}»`)).toBeVisible()
  await expect(circlesPanel.getByText('Если добавишь')).toBeVisible()
  await expect(circlesPanel.getByText('станет лучшим')).toBeVisible()
  await expect(circlesPanel.locator('.nd-scenario-preview-card')).toBeVisible()
  await expect(circlesPanel.locator('.nd-scenario-preview-slot')).toHaveClass(/is-open/)
  await expect.poll(async () => {
    const maxHeight = await circlesPanel.locator('.nd-scenario-preview-clip').evaluate((element) => (
      window.getComputedStyle(element).maxHeight
    ))
    return Number.parseFloat(maxHeight)
  }).toBeGreaterThan(0)
  await expect(circlesPanel.getByText(firstPseudonym).first()).toHaveCSS('color', 'rgb(192, 96, 58)')
  await circlesPanel.hover()
  await expect(circlesPanel.locator('.nd-scenario-preview-slot')).not.toHaveClass(/is-open/)
  await expect(circlesPanel.locator('.nd-scenario-current').first().locator('.nd-chip-text').first()).toHaveCSS('opacity', '1')

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

  const moveCard = movesPanel
    .locator('li')
    .filter({ hasText: moveBook.title })
    .first()
  const addMoveResponse = page.waitForResponse(
    r => r.url().includes('/api/matching/books') && r.request().method() === 'POST',
  )
  const addButton = moveCard.getByRole('button', { name: 'Хочу читать' })
  await addButton.hover()
  await expect(moveCard.getByText('книга встанет на 1-е место в твоём списке')).toBeVisible()
  await expect(moveCard.getByRole('button', { name: 'Хочу читать * на первое место' })).not.toBeVisible()
  await addButton.click()
  await addMoveResponse

  await expect(catalogMine).toContainText(moveBook.title, { timeout: 15_000 })
  await page.reload()
  await page.waitForLoadState('domcontentloaded')
  await expect(page.getByRole('heading', { name: 'Сценарий 1' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: moveBook.title, exact: true })).toBeVisible()
  await expect(page.getByText('Покрытие: все 3').first()).toBeVisible()

  await page.goto('about:blank')
})
