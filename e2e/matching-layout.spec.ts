import { test, expect, type Page } from './fixtures'
import { epic, feature } from 'allure-js-commons'

async function joinMatchingSessionAndAddBooks(page: Page, sessionId: string, bookIds: string[], name = 'E2E Matching Reader') {
  const joinRes = await page.request.post(`/api/matching/sessions/${sessionId}/join`, { data: { name } })
  expect(joinRes.ok()).toBe(true)
  for (const bookId of bookIds) {
    const addRes = await page.request.post('/api/matching/books', { data: { bookId } })
    expect(addRes.ok()).toBe(true)
  }
  if (bookIds.length > 0) {
    const rankRes = await page.request.patch('/api/matching/priorities', { data: { bookIds } })
    expect(rankRes.ok()).toBe(true)
  }
}

test.beforeEach(async () => {
  await epic('UI')
  await feature('Состояния интерфейса')
})

test.describe('Matching books: mobile layout and focus', () => {
  test('participant instructions expand inline without mobile overflow', async ({
    matchingBooksFixture,
    openMatchingPage,
  }) => {
    const { books, participantA } = matchingBooksFixture
    const participantPage = await openMatchingPage(participantA)
    await participantPage.setViewportSize({ width: 393, height: 852 })
    await participantPage.goto('/matching')
    await expect(participantPage.getByTestId('matching-books-view')).toBeVisible()

    const disclosure = participantPage.getByRole('button', { name: 'Подробнее' })
    const firstCard = participantPage.getByTestId(`matching-book-card-${books[0].id}`)
    const collapsedCardBox = await firstCard.boundingBox()
    const disclosureBox = await disclosure.boundingBox()
    expect(collapsedCardBox).not.toBeNull()
    expect(disclosureBox).not.toBeNull()
    expect(disclosureBox!.height, 'mobile disclosure has a reachable tap target').toBeGreaterThanOrEqual(44)
    await expect(participantPage.getByRole('list', { name: 'Как выбрать книгу' })).toHaveCount(0)

    await disclosure.click()
    const instructions = participantPage.getByRole('list', { name: 'Как выбрать книгу' })
    await expect(instructions).toBeVisible()
    await expect(participantPage.getByRole('button', { name: 'Короче' })).toHaveAttribute('aria-expanded', 'true')
    const [instructionsBox, expandedCardBox] = await Promise.all([
      instructions.boundingBox(),
      firstCard.boundingBox(),
    ])
    expect(instructionsBox).not.toBeNull()
    expect(expandedCardBox).not.toBeNull()
    expect(instructionsBox!.x).toBeGreaterThanOrEqual(0)
    expect(instructionsBox!.x + instructionsBox!.width).toBeLessThanOrEqual(394)
    expect(expandedCardBox!.y, 'expanded instructions push the book list down').toBeGreaterThan(collapsedCardBox!.y)
    expect(await participantPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    await participantPage.getByRole('button', { name: 'Короче' }).click()
    await expect(instructions).toHaveCount(0)
  })

  test('393px keeps cards and CTA in viewport, and book dialog traps/restores focus', { tag: '@matching-golden' }, async ({
    matchingBooksFixture,
    openMatchingPage,
  }) => {
    const { session, books, participantA, admin, getParticipantB, getParticipantC, addParticipant } = matchingBooksFixture
    const [participantB, participantC] = await Promise.all([getParticipantB(), getParticipantC()])
    await addParticipant('Галина Книги E2E')
    const setBookAction = async (
      participant: typeof participantA,
      action: 'setHard' | 'setConditional',
    ) => {
      const currentResponse = await participant.request.get(`/api/matching/state?session=${session.id}`)
      expect(currentResponse.ok(), await currentResponse.text()).toBe(true)
      const current = await currentResponse.json() as { session: { stateVersion: number } }
      const actionResponse = await participant.request.post(`/api/matching/sessions/${session.id}/book-actions`, {
        data: { action, bookId: books[0].id, expectedStateVersion: current.session.stateVersion },
      })
      expect(actionResponse.ok(), await actionResponse.text()).toBe(true)
    }
    await setBookAction(participantB, 'setHard')
    await setBookAction(participantC, 'setConditional')
    const participantAPage = await openMatchingPage(participantA)
    await participantAPage.setViewportSize({ width: 900, height: 844 })
    await participantAPage.goto('/matching')

    const booksTab = participantAPage.getByRole('tab', { name: 'Книги' })
    const scenariosTab = participantAPage.getByRole('tab', { name: 'Сценарии' })
    await scenariosTab.click()
    await expect(scenariosTab).toHaveAttribute('aria-selected', 'true')
    await participantAPage.setViewportSize({ width: 393, height: 852 })
    await expect(booksTab).toBeHidden()
    await expect(scenariosTab).toBeHidden()
    await expect(participantAPage.getByTestId('matching-books-view')).toBeVisible()

    const card = participantAPage.getByTestId(`matching-book-card-${books[0].id}`)
    const cardBox = await card.boundingBox()
    expect(cardBox).not.toBeNull()
    expect(cardBox!.x, 'card left edge is inside the 393px viewport').toBeGreaterThanOrEqual(0)
    expect(cardBox!.x + cardBox!.width, 'card right edge is inside the 393px viewport').toBeLessThanOrEqual(394)
    const cover = card.getByRole('button', { name: `Открыть книгу «${books[0].title}»` })
    const coverBox = await cover.boundingBox()
    expect(coverBox).not.toBeNull()
    expect(coverBox!.width, 'book cover keeps the 56px mobile width').toBeCloseTo(56, 0)
    expect(coverBox!.height, 'book cover keeps the 80px mobile height').toBeCloseTo(80, 0)
    expect(await cover.evaluate((element) => getComputedStyle(element).position), 'Next Image fill is anchored to the cover, not the whole card').toBe('relative')
    const cta = card.getByRole('button', { name: 'Записаться', exact: true })
    await expect(cta).toBeVisible()
    const ctaBox = await cta.boundingBox()
    expect(ctaBox).not.toBeNull()
    expect(ctaBox!.x + ctaBox!.width).toBeLessThanOrEqual(394)
    const splitCaret = card.getByRole('button', { name: 'Автоматическая запись, если соберётся круг' })
    const splitCaretBox = await splitCaret.boundingBox()
    expect(splitCaretBox).not.toBeNull()
    expect(splitCaretBox!.width, 'split disclosure stays a narrow tap target').toBeLessThanOrEqual(52)
    expect(ctaBox!.width, 'split primary action takes the remaining width').toBeGreaterThan(splitCaretBox!.width * 3)
    const title = card.getByRole('button', { name: books[0].title, exact: true })
    const titleBox = await title.boundingBox()
    expect(titleBox).not.toBeNull()
    expect(await title.evaluate((element) => getComputedStyle(element).minHeight), 'book title has no artificial tap-target height').toBe('0px')
    const metricBoxes = await card.locator('.nd-mb-metric').evaluateAll((elements) => (
      elements.map(element => element.getBoundingClientRect().height)
    ))
    expect(metricBoxes, 'hard, conditional and interest counters are all present').toHaveLength(3)
    expect(Math.max(...metricBoxes), 'metadata counters do not become 44px controls').toBeLessThan(32)
    expect(await participantAPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    const trigger = cover
    await trigger.focus()
    await trigger.click()
    const dialog = participantAPage.getByRole('dialog', { name: books[0].title })
    await expect(dialog).toBeVisible()
    const dialogBox = await dialog.boundingBox()
    expect(dialogBox).not.toBeNull()
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(394)
    const sheetCoverBox = await dialog.locator('.nd-mx-sheet-cover').boundingBox()
    expect(sheetCoverBox).not.toBeNull()
    expect(sheetCoverBox!.width).toBeCloseTo(96, 0)
    expect(sheetCoverBox!.height).toBeCloseTo(144, 0)
    const sheetTitle = dialog.locator('.nd-mx-sheet-title')
    const sheetTitleBox = await sheetTitle.boundingBox()
    expect(sheetTitleBox).not.toBeNull()
    const sheetTitlePaddingRight = await sheetTitle.evaluate((element) => parseFloat(getComputedStyle(element).paddingRight))
    expect(sheetTitleBox!.width - sheetTitlePaddingRight, 'sheet title receives the full second column').toBeGreaterThan(220)
    await expect(dialog.getByRole('button', { name: 'Закрыть' })).toBeFocused()
    await expect(dialog).toContainText(participantA.name)
    await expect(dialog).toContainText(participantB.name)
    await expect(dialog).toContainText(participantC.name)
    const participantChipHeights = await dialog.locator('.nd-mb-modal-participant').evaluateAll((elements) => (
      elements.map(element => element.getBoundingClientRect().height)
    ))
    expect(participantChipHeights.length).toBeGreaterThanOrEqual(3)
    expect(Math.max(...participantChipHeights), 'participant chips stay compact').toBeLessThanOrEqual(36)

    const participantRank = dialog.getByRole('button', { name: new RegExp(participantB.name) })
    await participantRank.click()
    const rankTooltip = dialog.getByRole('tooltip')
    await expect(rankTooltip).toContainText(new RegExp(`У ${participantB.name} на \\d+ месте`))
    const rankTooltipBox = await rankTooltip.boundingBox()
    expect(rankTooltipBox).not.toBeNull()
    expect(rankTooltipBox!.x).toBeGreaterThanOrEqual(0)
    expect(rankTooltipBox!.x + rankTooltipBox!.width).toBeLessThanOrEqual(394)
    await participantAPage.keyboard.press('Escape')
    await expect(rankTooltip).toHaveCount(0)

    const closeButton = dialog.getByRole('button', { name: 'Закрыть' })
    await closeButton.focus()
    await participantAPage.keyboard.press('Shift+Tab')
    await expect(dialog.locator(':focus')).toHaveCount(1)
    await closeButton.focus()
    await participantAPage.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()

    await trigger.click()
    const draggedDialog = participantAPage.getByRole('dialog', { name: books[0].title })
    const dragHandle = draggedDialog.getByRole('button', { name: 'Потяните лист вниз' })
    await dragHandle.dispatchEvent('pointerdown', { button: 0, pointerId: 7, pointerType: 'touch', clientY: 20 })
    await dragHandle.dispatchEvent('pointermove', { pointerId: 7, pointerType: 'touch', clientY: 130 })
    await dragHandle.dispatchEvent('pointerup', { pointerId: 7, pointerType: 'touch', clientY: 130 })
    await expect(draggedDialog).toHaveCount(0)

    await participantAPage.setViewportSize({ width: 360, height: 800 })
    const narrowCardBox = await card.boundingBox()
    expect(narrowCardBox).not.toBeNull()
    expect(narrowCardBox!.x).toBeGreaterThanOrEqual(0)
    expect(narrowCardBox!.x + narrowCardBox!.width).toBeLessThanOrEqual(361)
    expect(await participantAPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await trigger.click()
    const narrowDialog = participantAPage.getByRole('dialog', { name: books[0].title })
    const [narrowDialogBox, narrowSheetCoverBox, narrowSheetTitleBox] = await Promise.all([
      narrowDialog.boundingBox(),
      narrowDialog.locator('.nd-mx-sheet-cover').boundingBox(),
      narrowDialog.locator('.nd-mx-sheet-title').boundingBox(),
    ])
    expect(narrowDialogBox).not.toBeNull()
    expect(narrowDialogBox!.x + narrowDialogBox!.width).toBeLessThanOrEqual(361)
    expect(narrowSheetCoverBox).not.toBeNull()
    expect(narrowSheetCoverBox!.width).toBeCloseTo(96, 0)
    expect(narrowSheetCoverBox!.height).toBeCloseTo(144, 0)
    expect(narrowSheetTitleBox).not.toBeNull()
    expect(narrowSheetTitleBox!.width, '360px sheet still gives the title a readable column').toBeGreaterThan(190)
    const narrowChipHeights = await narrowDialog.locator('.nd-mb-modal-participant').evaluateAll((elements) => (
      elements.map(element => element.getBoundingClientRect().height)
    ))
    expect(Math.max(...narrowChipHeights)).toBeLessThanOrEqual(36)
    await narrowDialog.getByRole('button', { name: 'Закрыть' }).click()

    // Keep the compact participant/admin status regression in the same
    // mobile golden instead of spending a second browser-golden slot.
    const participantBPage = await openMatchingPage(participantB)
    const adminPage = await openMatchingPage(admin)
    await participantBPage.setViewportSize({ width: 393, height: 852 })
    await participantBPage.goto('/matching')
    const participantBCard = participantBPage.getByTestId(`matching-book-card-${books[0].id}`)
    await expect(participantBCard).toContainText('✓ Вы записаны')
    const cancelHard = participantBCard.getByRole('button', { name: 'Отменить', exact: true })
    const [participantBCardBox, cancelHardBox] = await Promise.all([
      participantBCard.boundingBox(),
      cancelHard.boundingBox(),
    ])
    expect(participantBCardBox).not.toBeNull()
    expect(cancelHardBox).not.toBeNull()
    expect(cancelHardBox!.height, 'secondary action remains a reachable tap target').toBeGreaterThanOrEqual(44)
    expect(cancelHardBox!.width, 'secondary action does not imitate the primary full-width CTA').toBeLessThan(participantBCardBox!.width / 2)
    await participantAPage.reload()
    await expect(card.getByRole('button', { name: '1 уже записал:ась' })).toBeVisible()
    await expect(card.getByLabel('Определившиеся участники')).toHaveCount(0)

    const stateResponse = await admin.request.get(`/api/matching/state?session=${session.id}&as=${participantA.userId}`)
    expect(stateResponse.ok(), await stateResponse.text()).toBe(true)
    const state = await stateResponse.json() as { session: { stateVersion: number } }
    const assignResponse = await admin.request.post(
      `/api/admin/matching/sessions/${session.id}/book-admin-actions`,
      { data: {
        action: 'assign', userId: participantA.userId, bookId: books[0].id,
        expectedStateVersion: state.session.stateVersion,
      } },
    )
    expect(assignResponse.ok(), await assignResponse.text()).toBe(true)
    await adminPage.goto('/matching')
    const adminCard = adminPage.getByTestId(`matching-book-card-${books[0].id}`)
    await expect(adminCard.getByText('2 уже записались')).toBeVisible()
    await expect(adminCard.getByText(`Без круга: ${participantA.name}`)).toHaveCount(0)
    expect(await adminPage.getByRole('button', { name: 'Управлять составом' }).count()).toBeGreaterThan(0)
  })

  test('card keeps one status summary and admin cards skip repeated participant-action copy', async ({
    matchingBooksFixture,
  openMatchingPage,
  }) => {
    const { session, books, participantA, admin, getParticipantB } = matchingBooksFixture
    const participantB = await getParticipantB()
    const participantAPage = await openMatchingPage(participantA)
    const participantBPage = await openMatchingPage(participantB)
    const adminPage = await openMatchingPage(admin)
    await participantBPage.goto('/matching')
    const participantBCard = participantBPage.getByTestId(`matching-book-card-${books[0].id}`)
    const hardResponse = participantBPage.waitForResponse((response) => (
      response.request().method() === 'POST' && response.url().endsWith('/book-actions')
    ))
    await participantBCard.getByRole('button', { name: 'Записаться', exact: true }).click()
    expect((await hardResponse).ok()).toBe(true)
    await participantBPage.reload()
    await expect(participantBCard).toContainText('✓ Вы записаны')

    await participantAPage.goto('/matching')
    await participantAPage.reload()
    const participantACard = participantAPage.getByTestId(`matching-book-card-${books[0].id}`)
    await expect(participantACard.getByRole('button', { name: '1 уже записал:ась' })).toBeVisible()
    await expect(participantACard.getByLabel('Определившиеся участники')).toHaveCount(0)

    const stateResponse = await admin.request.get(`/api/matching/state?session=${session.id}&as=${participantA.userId}`)
    expect(stateResponse.ok()).toBe(true)
    const state = await stateResponse.json() as { session: { stateVersion: number } }
    const assignResponse = await admin.request.post(
      `/api/admin/matching/sessions/${session.id}/book-admin-actions`,
      { data: {
        action: 'assign',
        userId: participantA.userId,
        bookId: books[0].id,
        expectedStateVersion: state.session.stateVersion,
      } },
    )
    expect(assignResponse.ok(), await assignResponse.text()).toBe(true)

    await adminPage.goto('/matching')
    await expect(adminPage.getByText('Административный режим — выбор участника недоступен')).toHaveCount(0)
    const adminCard = adminPage.getByTestId(`matching-book-card-${books[0].id}`)
    await expect(adminCard.getByText('2 уже записались')).toBeVisible()
    await expect(adminCard.getByText(`Без круга: ${participantA.name}`)).toHaveCount(0)
    expect(await adminPage.getByRole('button', { name: 'Управлять составом' }).count()).toBeGreaterThan(0)
  })
})

test.describe('Matching books: document flow and visual states', () => {
  test('desktop uses document scroll and separates the viewer-only tail', { tag: '@matching-golden' }, async ({
    matchingBooksFixture,
  openMatchingPage,
    createTestBook,
  }) => {
    const { participantA } = matchingBooksFixture
  const participantAPage = await openMatchingPage(participantA)
    let lastPersonalBookId = ''
    for (let index = 0; index < 5; index++) {
      const book = await createTestBook({ title: `E2E Personal Tail ${index} ${test.info().testId}`, author: 'Tail Author' })
      lastPersonalBookId = book.id
      const add = await participantA.request.post('/api/matching/books', { data: { bookId: book.id } })
      expect(add.ok(), await add.text()).toBe(true)
    }

    await participantAPage.setViewportSize({ width: 1440, height: 700 })
    await participantAPage.goto('/matching')

    const workspace = participantAPage.getByTestId('matching-scenarios-workspace')
    await expect(workspace).toHaveClass(/is-document/)
    expect(await workspace.evaluate(element => getComputedStyle(element).overflow)).toBe('visible')
    await expect(participantAPage.locator('.nd-mx-fade')).toHaveCount(0)
    await expect(participantAPage.getByTestId('matching-viewer-only-divider')).toHaveCount(1)
    expect(await participantAPage.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true)

    const lastCard = participantAPage.getByTestId(`matching-book-card-${lastPersonalBookId}`)
    await lastCard.scrollIntoViewIfNeeded()
    const lastBox = await lastCard.boundingBox()
    expect(lastBox).not.toBeNull()
    expect(lastBox!.y).toBeGreaterThanOrEqual(0)
    expect(lastBox!.y + lastBox!.height).toBeLessThanOrEqual(701)
  })

  test('formed book uses the semantic success fill', { tag: '@matching-golden' }, async ({ matchingBooksFixture, openMatchingPage }) => {
    const { session, books, participantA, getParticipantB, getParticipantC } = matchingBooksFixture
    const [participantB, participantC] = await Promise.all([getParticipantB(), getParticipantC()])
    const participantAPage = await openMatchingPage(participantA)
    const act = async (participant: typeof participantA, action: 'setConditional' | 'setHard') => {
      const currentResponse = await participant.request.get(`/api/matching/state?session=${session.id}`)
      expect(currentResponse.ok(), await currentResponse.text()).toBe(true)
      const current = await currentResponse.json() as { session: { stateVersion: number } }
      const response = await participant.request.post(`/api/matching/sessions/${session.id}/book-actions`, {
        data: { action, bookId: books[0].id, expectedStateVersion: current.session.stateVersion },
      })
      expect(response.ok(), await response.text()).toBe(true)
    }
    await act(participantA, 'setConditional')
    await act(participantB, 'setHard')
    await act(participantC, 'setHard')

    await participantAPage.goto('/matching')
    await participantAPage.reload()
    const card = participantAPage.getByTestId(`matching-book-card-${books[0].id}`)
    const colors = await card.evaluate((element) => {
      const probe = document.createElement('div')
      probe.style.background = 'var(--bg-tag-green)'
      document.body.appendChild(probe)
      const expected = getComputedStyle(probe).backgroundColor
      probe.remove()
      return {
        actual: getComputedStyle(element).backgroundColor,
        expected,
        base: getComputedStyle(document.body).backgroundColor,
      }
    })
    expect(colors.expected).not.toBe('rgba(0, 0, 0, 0)')
    expect(colors.expected).not.toBe(colors.base)
    expect(colors.actual).toBe(colors.expected)
  })
})

test.describe('Matching restored board shell', () => {
  test('board preserves controls, popup and compact geometry from desktop to mobile', { tag: '@matching-golden' }, async ({
    page,
    browser,
    createMatchingSession,
    createTestBook,
    loginAsUser,
  }) => {
    test.setTimeout(120_000)

    const session = await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
    const book = await createTestBook({
      title: `UI Matching ${test.info().testId}`,
      author: 'Layout Author',
      description: Array.from({ length: 40 }, (_, index) => `Длинный абзац ${index + 1} для проверки мобильного шита.`).join('\n\n'),
    })
    const registryBook = await createTestBook({ title: `UI Registry ${test.info().testId}`, author: 'Registry Author' })
    const viewer = await loginAsUser({ name: 'Анна Layout' })
    expect((await page.request.post(`/api/matching/sessions/${session.id}/join`, { data: { name: 'Анна Layout' } })).ok()).toBe(true)
    expect((await page.request.post('/api/matching/books', { data: { bookId: book.id } })).ok()).toBe(true)
    expect((await page.request.patch('/api/matching/priorities', { data: { bookIds: [book.id] } })).ok()).toBe(true)

    const peerContext = await browser.newContext()
    const peer = await peerContext.newPage()
    const peerEmail = `e2e-ui-matching-peer-${Date.now()}@test.invalid`
    expect((await peer.request.post('/api/test/session', { data: { email: peerEmail, name: 'Борис Layout', telegramUsername: 'boris_layout' } })).ok()).toBe(true)
    expect((await peer.request.post(`/api/matching/sessions/${session.id}/join`, { data: { name: 'Борис Layout' } })).ok()).toBe(true)
    expect((await peer.request.post('/api/matching/books', { data: { bookId: book.id } })).ok()).toBe(true)
    expect((await peer.request.patch('/api/matching/priorities', { data: { bookIds: [book.id] } })).ok()).toBe(true)

    const registryContexts = await Promise.all([browser.newContext(), browser.newContext()])
    const registryPages = await Promise.all(registryContexts.map(context => context.newPage()))
    const registryEmails = [
      `e2e-ui-registry-a-${Date.now()}@test.invalid`,
      `e2e-ui-registry-b-${Date.now()}@test.invalid`,
    ]
    for (let index = 0; index < registryPages.length; index += 1) {
      const actor = registryPages[index]
      const name = `Registry ${index + 1}`
      expect((await actor.request.post('/api/test/session', { data: { email: registryEmails[index], name, telegramUsername: `registry_${index}` } })).ok()).toBe(true)
      expect((await actor.request.post(`/api/matching/sessions/${session.id}/join`, { data: { name } })).ok()).toBe(true)
      expect((await actor.request.post('/api/matching/books', { data: { bookId: registryBook.id } })).ok()).toBe(true)
      expect((await actor.request.patch('/api/matching/priorities', { data: { bookIds: [registryBook.id] } })).ok()).toBe(true)
    }

    try {
      await page.goto('/matching')

      await expect(page.getByTestId('matching-header')).toBeVisible()
      await expect(page.getByRole('link', { name: /каталог/i })).toBeVisible()
      await expect(page.getByText(/Вы —/)).toContainText('Анна Layout')
      await expect(page.getByTestId('matching-scenarios-workspace')).toBeVisible()
      await expect(page.getByText(/Мои ходы|Лента событий/)).toHaveCount(0)

      const workspace = page.getByTestId('matching-scenarios-workspace')
      const catalog = page.getByTestId('matching-catalog-intro')
      const workspaceBox = await workspace.boundingBox()
      const catalogBox = await catalog.boundingBox()
      expect(workspaceBox).not.toBeNull()
      expect(catalogBox).not.toBeNull()
      expect(workspaceBox!.width).toBeGreaterThan(page.viewportSize()!.width * 0.9)
      expect(catalogBox!.y - (workspaceBox!.y + workspaceBox!.height)).toBeGreaterThanOrEqual(0)
      expect(catalogBox!.y - (workspaceBox!.y + workspaceBox!.height)).toBeLessThan(48)

      const scenarioScroll = page.getByTestId('matching-scenarios-scroll')
      const scrollStyle = await scenarioScroll.evaluate((element) => ({
        overflowY: getComputedStyle(element).overflowY,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      }))
      // The scenarios region is an internal scroll area (overflow-y:auto). With the
      // taller board (82svh) and few scenarios it may not actually overflow — only
      // assert page-scroll isolation when it does.
      expect(scrollStyle.overflowY).toBe('auto')
      expect(scrollStyle.clientHeight).toBeGreaterThan(0)
      expect(scrollStyle.scrollHeight).toBeGreaterThanOrEqual(scrollStyle.clientHeight)

      if (scrollStyle.scrollHeight > scrollStyle.clientHeight) {
        const pageScrollBefore = await page.evaluate(() => window.scrollY)
        await scenarioScroll.evaluate((element) => { element.scrollTop = 160 })
        await expect.poll(() => scenarioScroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
        expect(await page.evaluate(() => window.scrollY)).toBe(pageScrollBefore)
      }

      const fade = workspace.locator(':scope > div[aria-hidden="true"]')
      const fadeBox = await fade.boundingBox()
      const fadeBackground = await fade.evaluate((element) => getComputedStyle(element).backgroundImage)
      expect(fadeBox).not.toBeNull()
      expect(fadeBackground).toContain('linear-gradient')
      // The fade belongs to the inner scenario viewport: its bottom edge must
      // coincide with the workspace bottom instead of extending page height.
      expect(Math.abs((fadeBox!.y + fadeBox!.height) - (workspaceBox!.y + workspaceBox!.height))).toBeLessThanOrEqual(1)

      const circle = page.getByTestId('matching-circle').first()
      const cta = circle.getByTestId('circle-confirm-button')
      await expect(cta).toBeAttached()
      // CTA is always visible (not hover-gated)
      expect(await cta.evaluate((element) => getComputedStyle(element.parentElement!).opacity)).toBe('1')

      // Keyboard-only path: the always-visible CTA is reachable and interactive
      // (activating it confirms directly — there is no confirmation dialog).
      await page.locator('body').click({ position: { x: 1, y: 1 } })
      for (let index = 0; index < 30; index += 1) {
        await page.keyboard.press('Tab')
        if (await cta.evaluate(element => document.activeElement === element)) break
      }
      await expect(cta).toBeFocused()
      expect(await cta.evaluate((element) => getComputedStyle(element.parentElement!).pointerEvents)).toBe('auto')

      const coverButton = circle.getByRole('button', { name: /открыть книгу/i })
      await expect(coverButton).toBeVisible()
      await coverButton.click()
      const bookDialog = page.getByRole('dialog', { name: book.title })
      await expect(bookDialog).toBeVisible()
      await expect(bookDialog).toContainText(book.title)
      await page.keyboard.press('Escape')
      await expect(bookDialog).toHaveCount(0)

      for (const viewport of [
        { width: 820, height: 900, label: 'tablet' },
        { width: 390, height: 844, label: 'mobile' },
      ]) {
        await page.setViewportSize(viewport)

        const header = page.getByTestId('matching-header')
        const isMobile = viewport.width <= 540
        // Controls that stay visible on both the full and the compact mobile header.
        const controls = [
          page.getByRole('link', { name: /каталог/i }),
          header.getByRole('heading', { name: session.name }),
          header.getByText('● активна', { exact: true }),
        ]
        for (const control of controls) {
          await expect(control, `${viewport.label}: header control stays visible`).toBeVisible()
          const box = await control.boundingBox()
          expect(box, `${viewport.label}: header control has geometry`).not.toBeNull()
          expect(box!.x, `${viewport.label}: header control starts inside viewport`).toBeGreaterThanOrEqual(0)
          expect(box!.x + box!.width, `${viewport.label}: header control ends inside viewport`).toBeLessThanOrEqual(viewport.width + 1)
        }
        const sessionMenuTrigger = header.getByRole('button', { name: /участники и меню сессии: 4/i })
        await expect(sessionMenuTrigger).toBeVisible()
        const sessionMenuTriggerBox = await sessionMenuTrigger.boundingBox()
        expect(sessionMenuTriggerBox).not.toBeNull()
        expect(sessionMenuTriggerBox!.x).toBeGreaterThanOrEqual(0)
        expect(sessionMenuTriggerBox!.x + sessionMenuTriggerBox!.width).toBeLessThanOrEqual(viewport.width + 1)
        expect(sessionMenuTriggerBox!.y).toBeGreaterThanOrEqual(0)
        expect(sessionMenuTriggerBox!.y + sessionMenuTriggerBox!.height).toBeLessThanOrEqual(viewport.height + 1)
        if (isMobile) {
          expect(sessionMenuTriggerBox!.width).toBeGreaterThanOrEqual(44)
          expect(sessionMenuTriggerBox!.height).toBeGreaterThanOrEqual(44)
          await expect(header.locator('.nd-mx-hdr-leave')).toBeHidden()
        } else {
          await expect(header.locator('.nd-mx-hdr-leave')).toBeVisible()
        }
        // Verbose meta collapses on the compact mobile header (≤540px), stays on wider screens
        const collapsibleMeta = [
          header.getByText('Группы по 2', { exact: true }),
          header.getByText('Дедлайн не задан', { exact: true }),
          header.getByText(/Вы —/),
        ]
        for (const meta of collapsibleMeta) {
          if (isMobile) await expect(meta, `${viewport.label}: verbose meta hidden`).toBeHidden()
          else await expect(meta, `${viewport.label}: verbose meta visible`).toBeVisible()
        }

        const horizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
        expect(horizontalOverflow, `${viewport.label}: page has no accidental horizontal overflow`).toBeLessThanOrEqual(1)

        await sessionMenuTrigger.click()
        const popover = page.getByRole('dialog', { name: 'Участники' })
        await expect(popover).toBeVisible()
        const popoverBox = await popover.boundingBox()
        expect(popoverBox).not.toBeNull()
        expect(popoverBox!.x).toBeGreaterThanOrEqual(0)
        expect(popoverBox!.x + popoverBox!.width).toBeLessThanOrEqual(viewport.width + 1)
        expect(popoverBox!.y).toBeGreaterThanOrEqual(0)
        expect(popoverBox!.y + popoverBox!.height).toBeLessThanOrEqual(viewport.height + 1)
        await expect(popover).toContainText('Анна Layout · вы')
        if (isMobile) {
          await expect(popover).toContainText('Группы по 2')
          await expect(popover).toContainText('Дедлайн не задан')
          await expect(popover.getByRole('button', { name: 'Покинуть сессию' })).toBeVisible()
        }
        await popover.getByRole('button', { name: /закрыть список/i }).click()

        if (viewport.label === 'mobile') {
          // Catalog is hidden on the mobile board; scenarios flow in the page (no inner-scroll cap)
          await expect(page.getByTestId('matching-catalog-panel')).toBeHidden()
          const scrollOverflow = await page.getByTestId('matching-scenarios-scroll').evaluate((element) => getComputedStyle(element).overflowY)
          expect(scrollOverflow, 'mobile: scenarios flow in the page, not an inner scroll').toBe('visible')

          // Book popup becomes a full-width bottom sheet (desktop modal caps at 640px centered)
          await coverButton.click()
          const mobileBookDialog = page.getByRole('dialog', { name: book.title })
          await expect(mobileBookDialog).toBeVisible()
          // wait for the slide-up to settle at the bottom before measuring
          await expect.poll(async () => {
            const box = await mobileBookDialog.boundingBox()
            return box ? Math.round(box.y + box.height) : 99999
          }, { message: 'sheet settles on-screen at the bottom' }).toBeLessThanOrEqual(viewport.height + 1)
          const dialogBox = await mobileBookDialog.boundingBox()
          expect(dialogBox).not.toBeNull()
          expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
          expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(viewport.width + 1)
          expect(dialogBox!.width, 'mobile popup is a full-width sheet').toBeGreaterThan(viewport.width * 0.9)
          expect(dialogBox!.y).toBeGreaterThanOrEqual(0)
          const sheetScroll = mobileBookDialog.locator('.nd-mx-sheet-scroll')
          await sheetScroll.evaluate(element => { element.scrollTop = element.scrollHeight })
          await expect.poll(() => sheetScroll.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
          const sheetClose = mobileBookDialog.getByRole('button', { name: 'Закрыть' })
          const sheetCloseBox = await sheetClose.boundingBox()
          expect(sheetCloseBox).not.toBeNull()
          expect(sheetCloseBox!.y).toBeGreaterThanOrEqual(0)
          expect(sheetCloseBox!.y + sheetCloseBox!.height).toBeLessThanOrEqual(viewport.height + 1)
          await sheetClose.click()
          await expect(mobileBookDialog).toHaveCount(0)
        }
      }

      // The CTA must stay visible on a real touch/mobile context, not only
      // after resizing a desktop context.
      const touchContext = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } })
      try {
        const touchPage = await touchContext.newPage()
        const touchLogin = await touchPage.request.post('/api/test/session', {
          data: { email: viewer.email, name: viewer.name, telegramUsername: 'anna_layout_touch' },
        })
        expect(touchLogin.ok(), await touchLogin.text()).toBe(true)
        await touchPage.goto('/matching')
        await expect(touchPage.getByTestId('circle-confirm-button').first()).toBeVisible()
      } finally {
        await touchContext.close()
      }

      await page.setViewportSize({ width: 1440, height: 900 })
      const activeDesktopWorkspace = await page.getByTestId('matching-scenarios-workspace').boundingBox()
      expect(activeDesktopWorkspace).not.toBeNull()

      // Каждый актёр закрепляет свой круг. expectedStateVersion, взятый до PUT,
      // может устареть, пока предыдущий актёр коммитит подтверждение (гонка версий),
      // поэтому на 409 перечитываем состояние и пробуем ещё раз. Остальные ошибки
      // не маскируем ретраем: они должны сохранить status/body в отчёте nightly.
      const confirmOwnCircle = async (requestCtx: typeof page.request) => {
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          const stateResponse = await requestCtx.get(`/api/matching/state?session=${session.id}`)
          const stateBody = await stateResponse.text()
          if (!stateResponse.ok()) {
            throw new Error(`Failed to read matching state: ${stateResponse.status()} ${stateBody}`)
          }

          let state: {
            session: { stateVersion: number }
            scenarios: Array<{ circles: Array<{ circleKey: string; viewerIsMember: boolean }> }>
          }
          try {
            state = JSON.parse(stateBody) as typeof state
          } catch {
            throw new Error(`Matching state returned invalid JSON: ${stateBody}`)
          }

          const circle = state.scenarios.flatMap(scenario => scenario.circles).find(candidate => candidate.viewerIsMember)
          if (!circle) {
            throw new Error(`Matching state has no circle for the current actor: ${stateBody}`)
          }

          const confirmationResponse = await requestCtx.put(`/api/matching/sessions/${session.id}/confirmation`, {
            data: { circleKey: circle.circleKey, expectedStateVersion: state.session.stateVersion },
          })
          const confirmationBody = await confirmationResponse.text()
          if (confirmationResponse.ok()) return
          let confirmationError: unknown
          try {
            confirmationError = (JSON.parse(confirmationBody) as { error?: unknown }).error
          } catch {
            confirmationError = undefined
          }
          if (confirmationResponse.status() !== 409 || confirmationError !== 'stale_state') {
            throw new Error(`Failed to confirm matching circle: ${confirmationResponse.status()} ${confirmationBody}`)
          }
          if (attempt === 3) {
            throw new Error(`Matching confirmation stayed stale after 3 attempts: 409 ${confirmationBody}`)
          }
        }
      }

      await confirmOwnCircle(page.request)
      await page.reload()
      const waiting = page.getByTestId('circle-waiting').first()
      await expect(waiting).toBeVisible()
      const waitingStyle = await waiting.evaluate(element => {
        const computed = getComputedStyle(element)
        return {
          borderLeftWidth: computed.borderLeftWidth,
          borderLeftStyle: computed.borderLeftStyle,
          backgroundColor: computed.backgroundColor,
        }
      })
      expect(waitingStyle.borderLeftStyle).toBe('solid')
      expect(parseFloat(waitingStyle.borderLeftWidth)).toBeGreaterThan(0)
      expect(waitingStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)')
      const mark = page.getByLabel(/: подтвердил$/).first()
      await expect(mark).toBeVisible()
      const markRow = mark.locator('xpath=..')
      const markChip = markRow.locator('.nd-chip-text')
      const [markBox, markChipBox] = await Promise.all([mark.boundingBox(), markChip.boundingBox()])
      expect(markBox).not.toBeNull()
      expect(markChipBox).not.toBeNull()
      expect(markBox!.x - (markChipBox!.x + markChipBox!.width)).toBeLessThan(16)
      await confirmOwnCircle(peer.request)
      for (const actor of registryPages) {
        await confirmOwnCircle(actor.request)
      }

      await page.reload()
      const observerWorkspace = await page.getByTestId('matching-scenarios-workspace').boundingBox()
      const ownCircle = page.getByTestId('matching-own-locked-circle')
      await expect(ownCircle).toBeVisible()
      expect(observerWorkspace).not.toBeNull()
      expect(Math.abs(observerWorkspace!.width - activeDesktopWorkspace!.width)).toBeLessThanOrEqual(1)
      const ownBox = await ownCircle.boundingBox()
      const registry = page.getByTestId('matching-locked-registry')
      await expect(registry).toBeVisible()
      const registryBox = await registry.boundingBox()
      const liveScenariosBox = await page.getByTestId('matching-scenarios-empty').boundingBox()
      expect(ownBox).not.toBeNull()
      expect(registryBox).not.toBeNull()
      expect(liveScenariosBox).not.toBeNull()
      expect(ownBox!.y + ownBox!.height).toBeLessThanOrEqual(registryBox!.y)
      expect(registryBox!.y + registryBox!.height).toBeLessThanOrEqual(liveScenariosBox!.y)
    } finally {
      await peer.request.delete('/api/test/session', { data: { email: peerEmail } }).catch(() => {})
      await peerContext.close()
      for (let index = 0; index < registryPages.length; index += 1) {
        await registryPages[index].request.delete('/api/test/session', { data: { email: registryEmails[index] } }).catch(() => {})
      }
      await Promise.all(registryContexts.map(context => context.close()))
    }
  })

  test('touch keeps the circle CTA visible', async ({ browser, createMatchingSession, createTestBook }) => {
    const session = await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
    const book = await createTestBook({ title: `UI Touch ${test.info().testId}`, author: 'Touch Author' })
    const contexts = await Promise.all([browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } }), browser.newContext()])
    const pages = await Promise.all(contexts.map(context => context.newPage()))
    const emails = [`e2e-touch-a-${Date.now()}@test.invalid`, `e2e-touch-b-${Date.now()}@test.invalid`]
    try {
      for (let index = 0; index < pages.length; index += 1) {
        const actor = pages[index]
        expect((await actor.request.post('/api/test/session', { data: { email: emails[index], name: `Touch ${index}`, telegramUsername: `touch_${index}` } })).ok()).toBe(true)
        expect((await actor.request.post(`/api/matching/sessions/${session.id}/join`, { data: { name: `Touch ${index}` } })).ok()).toBe(true)
        expect((await actor.request.post('/api/matching/books', { data: { bookId: book.id } })).ok()).toBe(true)
        expect((await actor.request.patch('/api/matching/priorities', { data: { bookIds: [book.id] } })).ok()).toBe(true)
      }
      await pages[0].goto('/matching')
      const cta = pages[0].getByTestId('circle-confirm-button').first()
      await expect(cta).toBeVisible()
      expect(await cta.evaluate(element => getComputedStyle(element.parentElement!).opacity)).toBe('1')
    } finally {
      for (let index = 0; index < pages.length; index += 1) await pages[index].request.delete('/api/test/session', { data: { email: emails[index] } }).catch(() => {})
      await Promise.all(contexts.map(context => context.close()))
    }
  })

  // Регресс на «попап нельзя закрыть»: на мобилке шит занимает 90svh, крестик был
  // absolute внутри скролл-контейнера и уезжал вместе с длинным описанием — закрыть
  // становилось нечем. Крестик теперь в sticky-обёртке и обязан оставаться в кадре
  // после прокрутки контента вниз, и клик по нему должен реально закрывать шит.
  test('close button stays in the viewport after scrolling a long mobile sheet', async ({
    browser,
    createMatchingSession,
    createTestBook,
  }) => {
    const session = await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
    // Длинное описание гарантирует, что контент шита переполняет 90svh и скроллится.
    const longDescription = Array.from({ length: 40 }, (_, index) =>
      `Абзац ${index + 1}: длинное описание книги, чтобы шит гарантированно переполнялся и появлялась внутренняя прокрутка.`
    ).join('\n\n')
    const book = await createTestBook({
      title: `UI Sheet Close ${test.info().testId}`,
      author: 'Sheet Author',
      description: longDescription,
    })
    const viewport = { width: 390, height: 844 }
    const contexts = await Promise.all([
      browser.newContext({ hasTouch: true, isMobile: true, viewport }),
      browser.newContext(),
    ])
    const pages = await Promise.all(contexts.map(context => context.newPage()))
    const emails = [`e2e-sheet-close-a-${Date.now()}@test.invalid`, `e2e-sheet-close-b-${Date.now()}@test.invalid`]
    try {
      for (let index = 0; index < pages.length; index += 1) {
        const actor = pages[index]
        expect((await actor.request.post('/api/test/session', { data: { email: emails[index], name: `Sheet ${index}`, telegramUsername: `sheet_${index}` } })).ok()).toBe(true)
        expect((await actor.request.post(`/api/matching/sessions/${session.id}/join`, { data: { name: `Sheet ${index}` } })).ok()).toBe(true)
        expect((await actor.request.post('/api/matching/books', { data: { bookId: book.id } })).ok()).toBe(true)
        expect((await actor.request.patch('/api/matching/priorities', { data: { bookIds: [book.id] } })).ok()).toBe(true)
      }

      const page = pages[0]
      await page.goto('/matching')

      const coverButton = page.getByTestId('matching-circle').first().getByRole('button', { name: /открыть книгу/i })
      await coverButton.click()
      const dialog = page.getByRole('dialog', { name: book.title })
      await expect(dialog).toBeVisible()
      // Дать слайд-ап шита осесть у нижнего края.
      await expect.poll(async () => {
        const box = await dialog.boundingBox()
        return box ? Math.round(box.y + box.height) : 99999
      }).toBeLessThanOrEqual(viewport.height + 1)

      const closeButton = dialog.getByRole('button', { name: 'Закрыть' })

      // Крестик виден СРАЗУ на открытии, без единого скролла: шит меряется в svh,
      // поэтому не открывается выше вьюпорта (иначе верх с крестиком уезжал за кадр
      // и появлялся только после ручной прокрутки — репорт пользователя).
      const openBox = await closeButton.boundingBox()
      expect(openBox, 'close button has geometry on open').not.toBeNull()
      expect(openBox!.y, 'close button top edge on-screen on open').toBeGreaterThanOrEqual(0)
      expect(openBox!.y + openBox!.height, 'close button bottom edge on-screen on open').toBeLessThanOrEqual(viewport.height + 1)

      // Скроллится только внутренний .nd-mx-sheet-scroll (сам диалог — overflow:hidden,
      // крестик прибит к нему). Прокручиваем тело вниз до упора: на длинном описании
      // это уводило крестик, пока он жил внутри прокрутки.
      const scrollBody = dialog.locator('.nd-mx-sheet-scroll')
      await scrollBody.evaluate((element) => { element.scrollTop = element.scrollHeight })
      await expect.poll(() => scrollBody.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)

      // Крестик обязан остаться полностью в пределах вьюпорта после прокрутки.
      const closeBox = await closeButton.boundingBox()
      expect(closeBox).not.toBeNull()
      expect(closeBox!.y, 'close button top edge is on-screen').toBeGreaterThanOrEqual(0)
      expect(closeBox!.y + closeBox!.height, 'close button bottom edge is on-screen').toBeLessThanOrEqual(viewport.height + 1)
      expect(closeBox!.x + closeBox!.width, 'close button right edge is inside viewport').toBeLessThanOrEqual(viewport.width + 1)

      // И он действительно закрывает шит.
      await closeButton.click()
      await expect(dialog).toHaveCount(0)
    } finally {
      for (let index = 0; index < pages.length; index += 1) await pages[index].request.delete('/api/test/session', { data: { email: emails[index] } }).catch(() => {})
      await Promise.all(contexts.map(context => context.close()))
    }
  })

  test('confirm CTA is a flat success button and waiting state renders as a left line, not a filled box', async ({
    page,
    browser,
    createMatchingSession,
    createTestBook,
    loginAsUser,
  }) => {
    const session = await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
    const book = await createTestBook({ title: `UI Waiting Line ${test.info().testId}`, author: 'Layout Author' })
    await loginAsUser({ name: 'Анна Waiting' })
    expect((await page.request.post(`/api/matching/sessions/${session.id}/join`, { data: { name: 'Анна Waiting' } })).ok()).toBe(true)
    expect((await page.request.post('/api/matching/books', { data: { bookId: book.id } })).ok()).toBe(true)
    expect((await page.request.patch('/api/matching/priorities', { data: { bookIds: [book.id] } })).ok()).toBe(true)

    // A circle needs ≥2 members (minGroupSize 2) — add a peer who wants the same book.
    const peerContext = await browser.newContext()
    const peer = await peerContext.newPage()
    const peerEmail = `e2e-ui-waiting-peer-${Date.now()}@test.invalid`
    expect((await peer.request.post('/api/test/session', { data: { email: peerEmail, name: 'Борис Waiting', telegramUsername: 'boris_waiting' } })).ok()).toBe(true)
    expect((await peer.request.post(`/api/matching/sessions/${session.id}/join`, { data: { name: 'Борис Waiting' } })).ok()).toBe(true)
    expect((await peer.request.post('/api/matching/books', { data: { bookId: book.id } })).ok()).toBe(true)
    expect((await peer.request.patch('/api/matching/priorities', { data: { bookIds: [book.id] } })).ok()).toBe(true)

    await page.goto('/matching')

    const circle = page.getByTestId('matching-circle').first()
    const cta = circle.getByTestId('circle-confirm-button')
    await expect(cta).toBeAttached()

    // CTA is always visible (not hover-gated)
    await expect.poll(() => cta.evaluate((element) => getComputedStyle(element.parentElement!).opacity)).toBe('1')
    const ctaBox = await cta.boundingBox()
    expect(ctaBox).not.toBeNull()
    expect(ctaBox!.width).toBeGreaterThan(0)
    expect(ctaBox!.height).toBeGreaterThan(0)
    const ctaBackground = await cta.evaluate((element) => getComputedStyle(element).backgroundColor)
    // Warm success button: var(--success) fill, never transparent
    expect(ctaBackground).not.toBe('rgba(0, 0, 0, 0)')
    const ctaRadius = await cta.evaluate((element) => getComputedStyle(element).borderRadius)
    // Warm dashboard: soft control radius (var(--radius-control) = 8px), not sharp
    expect(parseFloat(ctaRadius)).toBeGreaterThan(0)

    // Scenario metrics live in a tooltip on «Сценарий N» — hidden until hover/focus
    const scnLabel = page.locator('.nd-scenario-label').first()
    const scnTip = scnLabel.locator('.nd-scenario-tip')
    expect(await scnTip.evaluate((element) => getComputedStyle(element).opacity)).toBe('0')
    await scnLabel.hover()
    await expect.poll(() => scnTip.evaluate((element) => getComputedStyle(element).opacity)).toBe('1')
    await expect(scnTip).toContainText('средний ранг')

    // Clicking the CTA confirms immediately (no confirmation dialog); reload to see
    // the persisted waiting state (same pattern as matching-satisfaction.spec.ts).
    const confirmResponse = page.waitForResponse((response) => (
      response.request().method() === 'PUT' &&
      response.url().endsWith(`/api/matching/sessions/${session.id}/confirmation`)
    ))
    await cta.click()
    expect((await confirmResponse).ok()).toBe(true)
    await page.reload()

    const waiting = circle.getByTestId('circle-waiting')
    await expect(waiting).toBeVisible()
    const waitingBox = await waiting.boundingBox()
    expect(waitingBox).not.toBeNull()
    expect(waitingBox!.width).toBeGreaterThan(0)

    // Left-line treatment: a visible border on the left edge, no filled background box.
    const waitingStyle = await waiting.evaluate((element) => {
      const computed = getComputedStyle(element)
      return {
        borderLeftWidth: computed.borderLeftWidth,
        borderLeftStyle: computed.borderLeftStyle,
        backgroundColor: computed.backgroundColor,
      }
    })
    expect(waitingStyle.borderLeftStyle).toBe('solid')
    expect(parseFloat(waitingStyle.borderLeftWidth)).toBeGreaterThan(0)
    expect(waitingStyle.backgroundColor).toBe('rgba(0, 0, 0, 0)')

    await expect(circle.getByTestId('circle-cancel-button')).toBeVisible()

    await peerContext.close()
  })

  test('confirmed checkmark hugs its participant, never floats at the column right edge', async ({
    page,
    browser,
    createMatchingSession,
    createTestBook,
    loginAsUser,
  }) => {
    const session = await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
    const book = await createTestBook({ title: `UI Tick ${test.info().testId}`, author: 'Tick Author' })
    await loginAsUser({ name: 'Анна Tick' })
    expect((await page.request.post(`/api/matching/sessions/${session.id}/join`, { data: { name: 'Анна Tick' } })).ok()).toBe(true)
    expect((await page.request.post('/api/matching/books', { data: { bookId: book.id } })).ok()).toBe(true)
    expect((await page.request.patch('/api/matching/priorities', { data: { bookIds: [book.id] } })).ok()).toBe(true)

    // A circle needs ≥2 members — add a peer who wants the same book.
    const peerContext = await browser.newContext()
    const peer = await peerContext.newPage()
    const peerEmail = `e2e-ui-tick-peer-${Date.now()}@test.invalid`
    expect((await peer.request.post('/api/test/session', { data: { email: peerEmail, name: 'Борис Tick', telegramUsername: 'boris_tick' } })).ok()).toBe(true)
    expect((await peer.request.post(`/api/matching/sessions/${session.id}/join`, { data: { name: 'Борис Tick' } })).ok()).toBe(true)
    expect((await peer.request.post('/api/matching/books', { data: { bookId: book.id } })).ok()).toBe(true)
    expect((await peer.request.patch('/api/matching/priorities', { data: { bookIds: [book.id] } })).ok()).toBe(true)

    await page.goto('/matching')

    const circle = page.getByTestId('matching-circle').first()
    const cta = circle.getByTestId('circle-confirm-button')
    await expect(cta).toBeAttached()

    // Confirm, then reload to render the persisted state where the confirming
    // member's row carries a ✓ (same reload pattern as the waiting-state test).
    const confirmResponse = page.waitForResponse((response) => (
      response.request().method() === 'PUT' &&
      response.url().endsWith(`/api/matching/sessions/${session.id}/confirmation`)
    ))
    await cta.click()
    expect((await confirmResponse).ok()).toBe(true)
    await page.reload()

    // The ✓ must read as belonging to its participant: sit immediately after the
    // chip, not float at the far right of the column (the old space-between bug).
    const mark = circle.getByLabel(/: подтвердил$/).first()
    await expect(mark).toBeVisible()
    const row = mark.locator('xpath=..')
    const chip = row.locator('.nd-chip-text')

    const chipBox = await chip.boundingBox()
    const markBox = await mark.boundingBox()
    const rowBox = await row.boundingBox()
    expect(chipBox).not.toBeNull()
    expect(markBox).not.toBeNull()
    expect(rowBox).not.toBeNull()

    // Adjacency: gap between chip's right edge and ✓ left edge is the flex gap
    // (0.4rem ≈ 6.4px). The old space-between put a whole column-width gulf here
    // (~150px+), so this bound mathematically separates fixed from broken.
    const gap = markBox!.x - (chipBox!.x + chipBox!.width)
    expect(gap).toBeGreaterThan(-2)
    expect(gap, 'checkmark hugs its participant chip').toBeLessThan(16)

    // Corroboration: the ✓ is nowhere near the row's right edge — the free space
    // the old layout consumed now sits to the ✓'s right instead.
    const slackToRowEnd = (rowBox!.x + rowBox!.width) - (markBox!.x + markBox!.width)
    expect(slackToRowEnd, 'checkmark is not shoved to the far right').toBeGreaterThan(30)

    await peerContext.close()
  })
})

test.describe('Matching layout', () => {
  test('scenarios use the released full width and legacy panels occupy no layout', async ({
    page,
    createMatchingSession,
    createTestBook,
    loginAsUser,
  }) => {
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 1440, height: 900 })
    const session = await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
    const bookIds: string[] = []
    for (let index = 0; index < 7; index += 1) {
      const book = await createTestBook({ title: `UI Circle ${index} ${Date.now()}`, author: 'Layout Author' })
      bookIds.push(book.id)
    }

    await loginAsUser({ name: 'UI Matching One' })
    await joinMatchingSessionAndAddBooks(page, session.id, bookIds, 'UI Matching One')
    await loginAsUser({ name: 'UI Matching Two' })
    await joinMatchingSessionAndAddBooks(page, session.id, bookIds, 'UI Matching Two')

    await page.goto('/matching')
    const board = page.getByTestId('matching-realtime-client')
    const card = page.getByTestId('matching-scenario-card').first()
    await expect(card).toBeVisible()
    const boardBox = await board.boundingBox()
    const cardBox = await card.boundingBox()
    expect(boardBox).not.toBeNull()
    expect(cardBox).not.toBeNull()
    expect(cardBox!.width).toBeGreaterThanOrEqual(boardBox!.width * 0.95)
    await expect(page.getByText('Группы по 2')).toBeVisible()
    await expect(page.getByText('Дедлайн не задан')).toBeVisible()
    await expect(page.getByText('● активна')).toBeVisible()
    await page.getByRole('button', { name: /участники и меню сессии: 2/i }).click()
    const participants = page.getByRole('dialog', { name: 'Участники' })
    await expect(participants).toContainText('UI Matching One')
    await expect(participants).toContainText('UI Matching Two')

    const scroll = page.getByTestId('matching-scenarios-scroll')
    const before = await scroll.evaluate((element) => ({ top: element.scrollTop, height: element.clientHeight, full: element.scrollHeight }))
    expect(before.full).toBeGreaterThan(before.height)
    const catalogBefore = await page.getByTestId('matching-catalog-intro').boundingBox()
    const pageYBefore = await page.evaluate(() => window.scrollY)
    await scroll.evaluate((element) => { element.scrollTop = 160 })
    await expect.poll(() => scroll.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
    const catalogAfter = await page.getByTestId('matching-catalog-intro').boundingBox()
    expect(await page.evaluate(() => window.scrollY)).toBe(pageYBefore)
    expect(catalogAfter!.y).toBeCloseTo(catalogBefore!.y, 0)
    await expect(page.getByText('Мои ходы', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Лента событий', { exact: true })).toHaveCount(0)
  })
})

test.describe('Matching book cards and two circles', () => {
  test('counters open the shared popup and one book keeps two stable circles', { tag: '@matching-golden' }, async ({
    matchingBooksFixture,
    openMatchingPage,
  }) => {
    test.setTimeout(120_000)
    const { session, books, participantA, addParticipant } = matchingBooksFixture
    const bookId = books[0].id
    const peers = await Promise.all([
      addParticipant('Круг Пётр'),
      addParticipant('Круг Павел'),
      addParticipant('Круг Пелагея'),
      addParticipant('Круг Прохор'),
      addParticipant('Круг Полина'),
    ])

    const page = await openMatchingPage(participantA)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/matching')

    const card = page.getByTestId(`matching-book-card-${bookId}`)

    // The interest counter is a real button that opens the same book popup.
    const counter = card.getByRole('button', { name: 'ещё у 5 эта книга в списке' })
    await expect(counter).toBeVisible()
    await counter.click()
    const dialog = page.getByRole('dialog', { name: books[0].title })
    await expect(dialog).toBeVisible()
    const groups = dialog.locator('.nd-mb-modal-participant')
    await expect(groups).toHaveCount(6)
    // Геометрия относительно самого шита, не вьюпорта: на десктопе шит (max-width
    // 640px) центрирован, т.е. при 1440px начинается на x = (1440-640)/2 = 400.
    // Абсолютная проверка `right <= 641` здесь всегда ложно-красная — group_right =
    // sheet_x + offset ≈ 400 + 437 = 837 > 641 даже без переполнения. Инвариант
    // «группа не вылезает из шита»: sheet_x <= group_x и group_right <= sheet_x + sheet_width.
    const sheetBox = await dialog.boundingBox()
    if (!sheetBox) throw new Error('dialog has no bounding box')
    expect(sheetBox.width, 'desktop sheet keeps its 640px cap').toBeLessThanOrEqual(641)
    const groupBoxes = await groups.evaluateAll((els) => els.map((el) => {
      const rect = el.getBoundingClientRect()
      return { x: rect.x, right: rect.x + rect.width, width: rect.width }
    }))
    for (const box of groupBoxes) {
      expect(box.width, 'each name+status group has geometry').toBeGreaterThan(0)
      expect(box.x, 'group left edge inside the sheet').toBeGreaterThanOrEqual(sheetBox.x)
      expect(box.right, 'group right edge inside the sheet').toBeLessThanOrEqual(sheetBox.x + sheetBox.width + 1)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)

    // Four conditionals then two hard cross the threshold in one formation, so the
    // book assigns all six and the deterministic partition yields two circles of three.
    const act = async (identity: typeof participantA, action: 'setConditional' | 'setHard') => {
      const stateResponse = await identity.request.get(`/api/matching/state?session=${session.id}`)
      expect(stateResponse.ok(), await stateResponse.text()).toBe(true)
      const current = await stateResponse.json() as { session: { stateVersion: number } }
      const response = await identity.request.post(`/api/matching/sessions/${session.id}/book-actions`, {
        data: { action, bookId, expectedStateVersion: current.session.stateVersion },
      })
      expect(response.ok(), await response.text()).toBe(true)
    }
    await act(peers[0], 'setConditional')
    await act(peers[1], 'setConditional')
    await act(peers[2], 'setConditional')
    await act(participantA, 'setConditional')
    await act(peers[3], 'setHard')
    await act(peers[4], 'setHard')

    await page.reload()
    const circles = card.locator('.nd-mb-circle')
    await expect(circles).toHaveCount(2)
    // Exactly one circle is the viewer's own.
    await expect(card.locator('.nd-mb-circle.is-mine')).toHaveCount(1)
    await expect(card.getByRole('heading', { name: /· ваш/ })).toHaveCount(1)

    // The formed card keeps only the 3px success inset — the old extra 4px assigned
    // border-left is gone, so the left mark can never be wider than the inset line.
    const borderLeftWidth = await card.evaluate((el) => getComputedStyle(el).borderLeftWidth)
    expect(parseFloat(borderLeftWidth), 'no separate assigned 4px border').toBeLessThan(4)

    const desktopBoxes = await circles.evaluateAll((els) => els.map((el) => {
      const rect = el.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }))
    const [d1, d2] = desktopBoxes
    const horizontalOverlap = Math.min(d1.x + d1.width, d2.x + d2.width) - Math.max(d1.x, d2.x)
    const verticalOverlap = Math.min(d1.y + d1.height, d2.y + d2.height) - Math.max(d1.y, d2.y)
    expect(horizontalOverlap > 1 && verticalOverlap > 1, 'desktop circles do not overlap').toBe(false)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    // Mobile: the two circles collapse into one column with no horizontal overflow.
    await page.setViewportSize({ width: 390, height: 844 })
    await page.reload()
    await expect(circles).toHaveCount(2)
    const mobileBoxes = await circles.evaluateAll((els) => els.map((el) => {
      const rect = el.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }))
    const [m1, m2] = mobileBoxes
    expect(m2.y, 'circles stack vertically on mobile').toBeGreaterThanOrEqual(m1.y + m1.height - 1)
    for (const box of mobileBoxes) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(391)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  })
})

test.describe('Satisfaction ranking gate layout', () => {
  test('satisfaction ranking gate fits one viewport (CTA visible without scroll)', async ({
    page,
    createMatchingSession,
    createTestBook,
    loginAsUser,
    dbExec,
    auditCleanup,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })

    const session = await createMatchingSession({
      minGroupSize: 3,
      maxGroupSize: 3,
    })
    const bookA = await createTestBook({ title: `UI Gate Book A ${Date.now()}`, author: 'Gate Author' })
    const bookB = await createTestBook({ title: `UI Gate Book B ${Date.now()}`, author: 'Gate Author' })

    // Two participants with complete rankings so the gate is reachable
    await loginAsUser({ name: 'UI Gate Peer One' })
    await joinMatchingSessionAndAddBooks(page, session.id, [bookA.id, bookB.id])
    await loginAsUser({ name: 'UI Gate Peer Two' })
    await joinMatchingSessionAndAddBooks(page, session.id, [bookA.id, bookB.id])

    // Reproduce a legacy viewer whose signup survived without a priority row.
    const viewer = await loginAsUser({ name: 'UI Gate Viewer' })
    const joinRes = await page.request.post(`/api/matching/sessions/${session.id}/join`, {
      data: { name: 'UI Gate Viewer' },
    })
    expect(joinRes.ok()).toBe(true)
    const addRes = await page.request.post('/api/matching/books', { data: { bookId: bookA.id } })
    expect(addRes.ok()).toBe(true)
    auditCleanup.trackUser(viewer.userId)
    await dbExec(
      'delete from book_priorities where user_id = $1 and book_id = $2',
      [viewer.userId, bookA.id],
    )

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/matching')

    const gate = page.getByTestId('ranking-gate')
    await expect(gate).toBeVisible()
    const enter = page.getByTestId('ranking-gate-enter')
    const box = await enter.boundingBox()
    const viewport = page.viewportSize()!
    expect(box).not.toBeNull()
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1)
  })

  test('на мобильном (375×812) кнопка «Войти в сессию» видна и находится в пределах вьюпорта', async ({
    page,
    createMatchingSession,
    createTestBook,
    loginAsUser,
    dbExec,
    auditCleanup,
  }) => {
    const session = await createMatchingSession({
      minGroupSize: 3,
      maxGroupSize: 3,
    })
    const bookA = await createTestBook({ title: `UI Gate Mobile Book A ${Date.now()}`, author: 'Gate Author' })
    const bookB = await createTestBook({ title: `UI Gate Mobile Book B ${Date.now()}`, author: 'Gate Author' })

    // Two participants with complete rankings so the gate is reachable
    await loginAsUser({ name: 'UI Gate Mobile Peer One' })
    await joinMatchingSessionAndAddBooks(page, session.id, [bookA.id, bookB.id])
    await loginAsUser({ name: 'UI Gate Mobile Peer Two' })
    await joinMatchingSessionAndAddBooks(page, session.id, [bookA.id, bookB.id])

    // Reproduce a legacy viewer whose signup survived without a priority row.
    const viewer = await loginAsUser({ name: 'UI Gate Mobile Viewer' })
    const joinRes = await page.request.post(`/api/matching/sessions/${session.id}/join`, {
      data: { name: 'UI Gate Mobile Viewer' },
    })
    expect(joinRes.ok()).toBe(true)
    const addRes = await page.request.post('/api/matching/books', { data: { bookId: bookA.id } })
    expect(addRes.ok()).toBe(true)
    auditCleanup.trackUser(viewer.userId)
    await dbExec(
      'delete from book_priorities where user_id = $1 and book_id = $2',
      [viewer.userId, bookA.id],
    )

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto('/matching')

    const gate = page.getByTestId('ranking-gate')
    await expect(gate).toBeVisible()

    const enter = page.getByTestId('ranking-gate-enter')
    const viewport = page.viewportSize()!

    // На мобиле гейт скроллится как обычная страница, а CTA — sticky-бар. Кнопка
    // обязана быть в пределах вьюпорта БЕЗ доскролла до самого низа (иначе она
    // тонет под панелями — это и был баг: sticky ломался overflow:hidden предком).
    await page.evaluate(() => window.scrollTo(0, 0))
    await expect(enter).toBeVisible()
    let box = await enter.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1)

    // И остаётся приклеенной после прокрутки страницы вниз.
    await page.mouse.wheel(0, 400)
    box = await enter.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1)
  })
})

test.describe('Matching record button auto-enroll menu', () => {
  test('the caret dropdown opens fully on-screen below the button, desktop and mobile', { tag: '@matching-golden' }, async ({
    matchingBooksFixture,
    openMatchingPage,
  }) => {
    const { books, participantA } = matchingBooksFixture
    const page = await openMatchingPage(participantA)
    const card = page.getByTestId(`matching-book-card-${books[0].id}`)
    const caret = card.getByRole('button', { name: 'Автоматическая запись, если соберётся круг' })
    const option = card.getByRole('menuitemcheckbox', { name: 'Запишите меня автоматически, если соберётся круг' })

    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/matching')
      await caret.click()
      await expect(option).toBeVisible()

      const menuBox = await card.locator('.nd-mb-split-menu').boundingBox()
      const barBox = await card.locator('.nd-mb-split-bar').boundingBox()
      expect(menuBox).not.toBeNull()
      expect(barBox).not.toBeNull()
      if (viewport.width > 540) {
        await caret.hover()
        const dividerColors = await caret.evaluate((element) => {
          const probe = document.createElement('span')
          probe.style.color = 'var(--accent-line)'
          document.body.appendChild(probe)
          const expected = getComputedStyle(probe).color
          probe.remove()
          const style = getComputedStyle(element)
          return {
            actual: style.borderLeftColor,
            expected,
            width: style.borderLeftWidth,
            borderStyle: style.borderLeftStyle,
          }
        })
        expect(dividerColors.actual, 'desktop caret uses the visible split divider token').toBe(dividerColors.expected)
        expect(dividerColors.width).toBe('1px')
        expect(dividerColors.borderStyle).toBe('solid')
      }
      expect(menuBox!.x, `${viewport.width}px: menu left edge on-screen`).toBeGreaterThanOrEqual(0)
      expect(menuBox!.x + menuBox!.width, `${viewport.width}px: menu right edge on-screen`).toBeLessThanOrEqual(viewport.width + 1)
      expect(menuBox!.y + menuBox!.height, `${viewport.width}px: menu bottom edge on-screen`).toBeLessThanOrEqual(viewport.height + 1)
      // The menu drops below the record button rather than overlapping it.
      expect(menuBox!.y, `${viewport.width}px: menu sits below the button`).toBeGreaterThanOrEqual(barBox!.y + barBox!.height - 1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)

      // Escape closes the menu and returns focus to the caret.
      await page.keyboard.press('Escape')
      await expect(option).toHaveCount(0)
      await expect(caret).toBeFocused()
    }
  })
})
