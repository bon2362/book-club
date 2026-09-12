import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

test.beforeEach(async () => {
  await epic('UI')
  await feature('Matching')
})

test.describe('Matching canonical book board layout', () => {
  test('admin demand metrics tooltip stays inside the viewport', { tag: '@matching-golden' }, async ({
    matchingBooksFixture,
    openMatchingPage,
  }) => {
    const { books, admin, getParticipantB, getParticipantC } = matchingBooksFixture
    await Promise.all([getParticipantB(), getParticipantC()])
    const page = await openMatchingPage(admin)

    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/admin?tab=matching')

      const card = page.locator(`[data-testid="admin-demand-book"][data-book-id="${books[0].id}"]`)
      const trigger = card.locator('[aria-describedby]')
      await expect(trigger).toBeVisible()
      await trigger.focus()

      const tooltip = card.getByRole('tooltip')
      await expect(tooltip).toBeVisible()
      const tooltipBox = await tooltip.boundingBox()
      expect(tooltipBox).not.toBeNull()
      expect(tooltipBox!.x).toBeGreaterThanOrEqual(0)
      expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
    }
  })

  test('раскрытая строка участника держит книги под строкой и по одной в строке', async ({
    matchingBooksFixture,
    openMatchingPage,
  }) => {
    const { admin, participantA, getParticipantB } = matchingBooksFixture
    await getParticipantB()
    const page = await openMatchingPage(admin)

    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/admin?tab=matching&sub=people')

      const people = page.getByTestId('admin-matching-people')
      const row = people.getByTestId('admin-participant-row').filter({ hasText: participantA.name })
      await expect(row).toBeVisible()
      await row.click()
      await expect(row).toHaveAttribute('aria-expanded', 'true')

      const panel = people.getByTestId('admin-participant-books')
      const rowBox = (await row.boundingBox())!
      const panelBox = (await panel.boundingBox())!
      // Панель — продолжение строки: ниже неё и с отступом слева под вертикальной линейкой.
      expect(panelBox.y).toBeGreaterThanOrEqual(rowBox.y + rowBox.height - 1)
      expect(panelBox.x).toBeGreaterThan(rowBox.x)

      // Каждая книга занимает свою строку: у соседних позиций разные y.
      const items = panel.locator('[data-group="want"] li')
      await expect(items).toHaveCount(2)
      const first = (await items.nth(0).boundingBox())!
      const second = (await items.nth(1).boundingBox())!
      expect(second.y).toBeGreaterThanOrEqual(first.y + first.height - 1)

      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)

      // Повторный клик сворачивает.
      await row.click()
      await expect(people.getByTestId('admin-participant-books')).toHaveCount(0)
    }
  })

  test('one book board without mode tabs fits desktop and mobile', { tag: '@matching-golden' }, async ({
    matchingBooksFixture,
    openMatchingPage,
  }) => {
    const { books, participantA } = matchingBooksFixture
    const page = await openMatchingPage(participantA)

    for (const viewport of [{ width: 1280, height: 900 }, { width: 393, height: 852 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/matching')

      const board = page.getByTestId('matching-books-view')
      const card = page.getByTestId(`matching-book-card-${books[0].id}`)
      await expect(board).toBeVisible()
      await expect(page.getByRole('tab')).toHaveCount(0)
      await expect(page.getByText('Сценарии', { exact: true })).toHaveCount(0)
      await expect(page.getByTestId('matching-header').getByText(/Группы? (по )?\d/)).toHaveCount(0)
      await page.getByRole('button', { name: 'Показать книги, на которые пока нельзя записаться' }).click()
      await expect(card).toBeVisible()

      const [boardBox, cardBox] = await Promise.all([board.boundingBox(), card.boundingBox()])
      expect(boardBox).not.toBeNull()
      expect(cardBox).not.toBeNull()
      expect(cardBox!.x).toBeGreaterThanOrEqual(0)
      expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)

      const cover = card.getByRole('button', { name: `Открыть книгу «${books[0].title}»` })
      const coverBox = await cover.boundingBox()
      expect(coverBox).not.toBeNull()
      expect(await cover.evaluate((element) => getComputedStyle(element).position)).toBe('relative')
      if (viewport.width <= 540) {
        expect(coverBox!.width).toBeCloseTo(56, 0)
        expect(coverBox!.height).toBeCloseTo(80, 0)
      }
    }
  })

  test('unavailable books stay collapsed and the tail toggle works on desktop and mobile', async ({
    matchingBooksFixture,
    openMatchingPage,
  }) => {
    const { books, participantA } = matchingBooksFixture
    const page = await openMatchingPage(participantA)
    const card = page.getByTestId(`matching-book-card-${books[0].id}`)
    const toggle = page.getByRole('button', { name: 'Показать книги, на которые пока нельзя записаться' })

    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/matching')

      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await expect(card).toHaveCount(0)
      const toggleBox = await toggle.boundingBox()
      expect(toggleBox).not.toBeNull()
      expect(toggleBox!.height).toBeGreaterThanOrEqual(44)
      expect(toggleBox!.x + toggleBox!.width).toBeLessThanOrEqual(viewport.width + 1)

      await toggle.focus()
      await page.keyboard.press('Enter')
      await expect(toggle).toHaveAttribute('aria-expanded', 'true')
      await expect(card).toBeVisible()

      await page.keyboard.press('Space')
      await expect(toggle).toHaveAttribute('aria-expanded', 'false')
      await expect(card).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
    }
  })

  test('books need two other participants before showing enrollment and preserve existing choices when demand disappears', async ({
    matchingBooksFixture,
    openMatchingPage,
  }) => {
    test.setTimeout(150_000)
    const { books, participantA, addParticipant } = matchingBooksFixture
    const page = await openMatchingPage(participantA)
    const card = page.getByTestId(`matching-book-card-${books[0].id}`)
    const record = card.getByRole('button', { name: 'Записаться', exact: true })
    const caret = card.getByRole('button', { name: 'Автоматическая запись, если соберётся круг' })
    const tailToggle = page.getByRole('button', { name: 'Показать книги, на которые пока нельзя записаться' })
    const viewports = [{ width: 1280, height: 900 }, { width: 390, height: 844 }]

    for (const viewport of viewports) {
      await page.setViewportSize(viewport)
      await page.goto('/matching')
      await expect(card).toHaveCount(0)
      await tailToggle.click()
      await expect(card).toBeVisible()
      await expect(record).toHaveCount(0)
      await expect(caret).toHaveCount(0)
      await expect(card.locator('.nd-mb-actions')).toHaveCount(0)
      const divider = page.getByTestId('matching-tail-divider')
      await expect(divider).toContainText('Записаться пока нельзя')
      await expect(divider).toContainText('Эти книги остаются в вашем списке, но в подборе не участвуют.')
      const reason = card.getByTestId('matching-book-tail-reason')
      await expect(reason).toHaveAttribute('data-reason', 'waiting')
      await expect(reason).toContainText('ЖДЁМ ДРУГИХ')
      const note = divider.locator('.nd-mb-divider-note')
      const [cardBox, noteBox] = await Promise.all([card.boundingBox(), note.boundingBox()])
      expect(cardBox).not.toBeNull()
      expect(noteBox).not.toBeNull()
      expect(noteBox!.y + noteBox!.height).toBeLessThanOrEqual(cardBox!.y)
      expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
    }

    const peer = await addParticipant('First overlap peer', [books[0]])
    for (const viewport of viewports) {
      await page.setViewportSize(viewport)
      await page.reload()
      await expect(record).toHaveCount(0)
      await expect(caret).toHaveCount(0)
      await tailToggle.click()
      await expect(card.getByTestId('matching-book-tail-reason')).toHaveAttribute('data-reason', 'waiting')
    }

    const secondPeer = await addParticipant('Second overlap peer', [books[0]])
    for (const viewport of viewports) {
      await page.setViewportSize(viewport)
      await page.reload()
      await expect(record).toBeVisible()
      // Карточка обменивает блок причины хвоста на блок записи, поэтому её высота — не
      // показатель: на десктопе она вырастает на полтора пикселя, на 390px наоборот
      // становится ниже (двухстрочная причина «ЖДЁМ ДРУГИХ» там выше кнопки). Прежняя
      // проверка «выросла минимум на 20px» была написана до появления блока причины и с
      // тех пор проверяла только устаревшее допущение. Смысл — в том, что управление
      // записью реально появилось внутри карточки и занимает место, а причина ушла.
      const [cardBox, recordBox] = await Promise.all([card.boundingBox(), record.boundingBox()])
      expect(recordBox!.height).toBeGreaterThan(24)
      expect(recordBox!.y).toBeGreaterThanOrEqual(cardBox!.y)
      expect(recordBox!.y + recordBox!.height).toBeLessThanOrEqual(cardBox!.y + cardBox!.height)
      expect(recordBox!.x + recordBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1)
      await expect(card.locator('.nd-mb-actions')).toHaveCount(1)
      await expect(card.getByTestId('matching-book-tail-reason')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
      const otherCard = page.getByTestId(`matching-book-card-${books[1].id}`)
      await expect(otherCard.getByRole('button', { name: 'Записаться', exact: true })).toHaveCount(0)
    }

    await caret.click()
    const conditionalResponse = page.waitForResponse(response => response.url().includes('/book-actions') && response.request().method() === 'POST')
    await card.getByRole('menuitemcheckbox').click()
    expect((await conditionalResponse).ok()).toBe(true)
    await page.reload()
    await expect(card).toContainText('Авто-запись включена')

    const remove = await peer.request.delete(`/api/matching/books/${books[0].id}`)
    expect(remove.ok(), await remove.text()).toBe(true)
    const removeSecond = await secondPeer.request.delete(`/api/matching/books/${books[0].id}`)
    expect(removeSecond.ok(), await removeSecond.text()).toBe(true)
    await page.reload()
    await expect(record).toHaveCount(0)
    await expect(caret).toHaveCount(0)
    await tailToggle.click()
    await expect(card).toContainText('Авто-запись включена')
    const cancelAutoResponse = page.waitForResponse(response => response.url().includes('/book-actions') && response.request().method() === 'POST')
    await card.getByRole('button', { name: 'Отменить авто-запись' }).click()
    expect((await cancelAutoResponse).ok()).toBe(true)
    await page.reload()
    await expect(card.getByText('Авто-запись включена')).toHaveCount(0)
    await expect(record).toHaveCount(0)

    const add = await peer.request.post('/api/matching/books', { data: { bookId: books[0].id } })
    expect(add.ok(), await add.text()).toBe(true)
    const addSecond = await secondPeer.request.post('/api/matching/books', { data: { bookId: books[0].id } })
    expect(addSecond.ok(), await addSecond.text()).toBe(true)
    await page.reload()
    const hardResponse = page.waitForResponse(response => response.url().includes('/book-actions') && response.request().method() === 'POST')
    await record.click()
    expect((await hardResponse).ok()).toBe(true)
    const removeAgain = await peer.request.delete(`/api/matching/books/${books[0].id}`)
    expect(removeAgain.ok(), await removeAgain.text()).toBe(true)
    const removeSecondAgain = await secondPeer.request.delete(`/api/matching/books/${books[0].id}`)
    expect(removeSecondAgain.ok(), await removeSecondAgain.text()).toBe(true)
    await page.reload()
    await tailToggle.click()
    await expect(card).toContainText('✓ Вы записаны')
    const cancelHardResponse = page.waitForResponse(response => response.url().includes('/book-actions') && response.request().method() === 'POST')
    await card.getByRole('button', { name: 'Отменить', exact: true }).click()
    expect((await cancelHardResponse).ok()).toBe(true)
    await page.reload()
    await expect(card.getByText('✓ Вы записаны')).toHaveCount(0)
    await expect(record).toHaveCount(0)
    await card.getByRole('button', { name: `Открыть книгу «${books[0].title}»` }).click()
    await expect(page.getByRole('dialog', { name: books[0].title })).toBeVisible()
  })

  test('keeps every card with enrollment above the single waiting section', async ({
    matchingBooksFixture,
    openMatchingPage,
  }) => {
    const { books, participantA, addParticipant } = matchingBooksFixture
    await addParticipant('One peer for first book', [books[0]])
    await addParticipant('First peer for second book', [books[1]])
    await addParticipant('Second peer for second book', [books[1]])
    const page = await openMatchingPage(participantA)
    await page.goto('/matching')

    const firstBook = page.getByTestId(`matching-book-card-${books[0].id}`)
    const secondBook = page.getByTestId(`matching-book-card-${books[1].id}`)
    const divider = page.getByTestId('matching-tail-divider')
    await expect(secondBook.getByRole('button', { name: 'Записаться', exact: true })).toBeVisible()
    await expect(firstBook).toHaveCount(0)
    await divider.getByRole('button', { name: 'Показать книги, на которые пока нельзя записаться' }).click()
    await expect(firstBook.getByRole('button', { name: 'Записаться', exact: true })).toHaveCount(0)
    const note = divider.locator('.nd-mb-divider-note')
    const [firstBox, secondBox, noteBox] = await Promise.all([
      firstBook.boundingBox(), secondBook.boundingBox(), note.boundingBox(),
    ])
    expect(firstBox).not.toBeNull()
    expect(secondBox).not.toBeNull()
    expect(noteBox).not.toBeNull()
    expect(secondBox!.y + secondBox!.height).toBeLessThanOrEqual(noteBox!.y)
    expect(noteBox!.y + noteBox!.height).toBeLessThanOrEqual(firstBox!.y)
  })

  test('mobile book sheet stays in the viewport and restores focus', async ({
    matchingBooksFixture,
    openMatchingPage,
  }) => {
    const { books, participantA } = matchingBooksFixture
    const page = await openMatchingPage(participantA)
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/matching')

    const trigger = page.getByRole('button', { name: `Открыть книгу «${books[0].title}»` })
    await trigger.focus()
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: books[0].title })
    await expect(dialog).toBeVisible()

    const dialogBox = await dialog.boundingBox()
    expect(dialogBox).not.toBeNull()
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(394)
    await expect.poll(async () => {
      const settledBox = await dialog.boundingBox()
      return settledBox ? settledBox.y + settledBox.height : Number.POSITIVE_INFINITY
    }).toBeLessThanOrEqual(853)

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test('auto-enroll menu stays below the record button on desktop and mobile', async ({
    matchingBooksFixture,
    openMatchingPage,
  }) => {
    const { books, participantA, getParticipantB } = matchingBooksFixture
    await getParticipantB()
    const page = await openMatchingPage(participantA)

    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/matching')
      const card = page.getByTestId(`matching-book-card-${books[0].id}`)
      const caret = card.getByRole('button', { name: 'Автоматическая запись, если соберётся круг' })
      await caret.click()

      const menu = card.locator('.nd-mb-split-menu')
      await expect(menu).toBeVisible()
      const [menuBox, barBox] = await Promise.all([
        menu.boundingBox(),
        card.locator('.nd-mb-split-bar').boundingBox(),
      ])
      expect(menuBox).not.toBeNull()
      expect(barBox).not.toBeNull()
      expect(menuBox!.x).toBeGreaterThanOrEqual(0)
      expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(menuBox!.y).toBeGreaterThanOrEqual(barBox!.y + barBox!.height - 1)

      await page.keyboard.press('Escape')
      await expect(menu).toHaveCount(0)
      await expect(caret).toBeFocused()
    }
  })
})
