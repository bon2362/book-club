import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

test.describe('Лента времени — правка на полотне', () => {
  test.setTimeout(120_000)

  test.beforeEach(async () => {
    await epic('Лента времени')
    await feature('Правка на полотне')
  })

  test('неавторизованный ответ не содержит непривязанные элементы общей базы', async ({
    page,
    createTestTimeline,
    loginAsAdmin,
    timelineAdminScope,
  }) => {
    const timeline = await createTestTimeline()
    const admin = await loginAsAdmin()
    const libraryTitle = timelineAdminScope.name('Секретный призрак')
    const typesResponse = await page.request.get('/api/admin/timeline/event-types')
    const types = (await typesResponse.json()).data as Array<{ id: string }>
    const createResponse = await page.request.post('/api/admin/timeline/events', {
      data: {
        title: libraryTitle,
        eventTypeId: types[0].id,
        start: { year: 1920, era: 'CE', month: null, day: null },
        end: null,
        ongoing: false,
        description: '',
        imageUrl: null,
        imageCaption: null,
      },
    })
    expect(createResponse.ok(), `${createResponse.status()} ${await createResponse.text()}`).toBe(true)

    await page.request.delete('/api/test/session', { data: { email: admin.email } })
    await page.context().clearCookies()

    const response = await page.request.get(timeline.url)
    const html = await response.text()
    expect(response.status()).toBe(200)
    expect(html).not.toContain(libraryTitle)

    await page.goto(timeline.url)
    await expect(page.getByTestId('timeline-admin-tools')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Править' })).toHaveCount(0)
  })

  test('админ создаёт событие на странице, после reload оно остаётся на полотне', async ({
    page,
    createTestTimeline,
    loginAsAdmin,
    timelineAdminScope,
  }) => {
    const timeline = await createTestTimeline()
    await loginAsAdmin()
    const title = timelineAdminScope.name('Создано на полотне')

    await page.goto(timeline.url)
    const detailShell = page.locator('.nd-timeline-detail-shell')
    const createEventButton = page.getByRole('button', { name: '+ Событие' })
    const [detailShellBox, createEventButtonBox] = await Promise.all([
      detailShell.boundingBox(),
      createEventButton.boundingBox(),
    ])
    expect(detailShellBox).not.toBeNull()
    expect(createEventButtonBox).not.toBeNull()
    expect(
      detailShellBox!.y + detailShellBox!.height,
      `Панель деталей ${JSON.stringify(detailShellBox)} перекрывает кнопку создания ${JSON.stringify(createEventButtonBox)}`,
    ).toBeLessThanOrEqual(createEventButtonBox!.y)
    await createEventButton.click()
    await page.getByLabel('Название нового события').fill(title)
    await expect(page.getByTestId('timeline-create-form').getByRole('button', { pressed: true })).toHaveCount(1)
    const createButton = page.getByRole('button', { name: 'Создать' })
    await createButton.scrollIntoViewIfNeeded()
    const createButtonBox = await createButton.boundingBox()
    expect(createButtonBox).not.toBeNull()
    const formOwnsButtonCenter = await page.evaluate(({ x, y }) => {
      return document.elementFromPoint(x, y)?.closest('[data-testid="timeline-create-form"]') !== null
    }, {
      x: createButtonBox!.x + createButtonBox!.width / 2,
      y: createButtonBox!.y + createButtonBox!.height / 2,
    })
    expect(formOwnsButtonCenter).toBe(true)
    await createButton.click()
    await expect(page.getByTestId('timeline-detail')).toContainText(title)

    await page.reload()
    await expect(page.getByTestId('timeline-canvas').getByRole('button', { name: title })).toBeVisible()
  })

  test('правка общего названия сохраняется в общей базе', async ({
    page,
    createTestTimeline,
    loginAsAdmin,
    timelineAdminScope,
  }) => {
    const timeline = await createTestTimeline()
    await loginAsAdmin()
    const title = timelineAdminScope.name('Общее новое название')

    await page.goto(timeline.url)
    await page.getByTestId('timeline-canvas').getByRole('button', { name: timeline.pointEvent.title }).click()
    await page.getByRole('button', { name: 'Править' }).click()
    await page.getByLabel('Название события').fill(title)
    await page.getByTestId('timeline-inline-editor').getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.getByTestId('timeline-detail-empty')).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('timeline-canvas').getByRole('button', { name: title })).toBeVisible()

    const eventsResponse = await page.request.get('/api/admin/timeline/events')
    expect(eventsResponse.ok()).toBe(true)
    const events = (await eventsResponse.json()).data as Array<{ id: string; title: string }>
    expect(events).toContainEqual(expect.objectContaining({ id: timeline.pointEvent.id, title }))
  })

  test('скрытие убирает событие с полотна, но оставляет в общей базе и связи', async ({
    page,
    createTestTimeline,
    loginAsAdmin,
  }) => {
    const timeline = await createTestTimeline()
    await loginAsAdmin()

    await page.goto(timeline.url)
    await page.getByTestId('timeline-canvas').getByRole('button', { name: timeline.pointEvent.title }).click()
    await page.getByRole('button', { name: 'Править' }).click()
    await page.getByRole('button', { name: 'Скрыть на ленте' }).click()
    await expect(page.getByTestId('timeline-detail-empty')).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('timeline-canvas').getByRole('button', { name: timeline.pointEvent.title })).toHaveCount(0)
    const events = (await (await page.request.get('/api/admin/timeline/events')).json()).data as Array<{ id: string }>
    expect(events.some(({ id }) => id === timeline.pointEvent.id)).toBe(true)
    const contents = (await (await page.request.get(`/api/admin/timeline/timelines/${timeline.id}/contents`)).json()).data as { events: Array<{ id: string; visible: boolean }> }
    expect(contents.events).toContainEqual(expect.objectContaining({ id: timeline.pointEvent.id, visible: false }))
  })

  test('открепление не удаляет событие из общей базы', async ({
    page,
    createTestTimeline,
    loginAsAdmin,
  }) => {
    const timeline = await createTestTimeline()
    await loginAsAdmin()

    await page.goto(timeline.url)
    await page.getByTestId('timeline-canvas').getByRole('button', { name: timeline.pointEvent.title }).click()
    await page.getByRole('button', { name: 'Править' }).click()
    await page.getByRole('button', { name: 'Открепить от ленты' }).click()
    await expect(page.getByTestId('timeline-detail-empty')).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('timeline-canvas').getByRole('button', { name: timeline.pointEvent.title })).toHaveCount(0)
    const events = (await (await page.request.get('/api/admin/timeline/events')).json()).data as Array<{ id: string }>
    expect(events.some(({ id }) => id === timeline.pointEvent.id)).toBe(true)
    const contents = (await (await page.request.get(`/api/admin/timeline/timelines/${timeline.id}/contents`)).json()).data as { events: Array<{ id: string }> }
    expect(contents.events.some(({ id }) => id === timeline.pointEvent.id)).toBe(false)
  })

  test('прикрепление делает событие нового типа видимым и сохраняет его после reload', async ({
    page,
    createTestTimeline,
    loginAsAdmin,
    timelineAdminScope,
  }) => {
    const timeline = await createTestTimeline()
    await loginAsAdmin()
    const typeTitle = timelineAdminScope.name('Новый тип')
    const eventTitle = timelineAdminScope.name('Неприкреплённое событие')

    const typeResponse = await page.request.post('/api/admin/timeline/event-types', {
      data: { title: typeTitle, color: '#5D7290', icon: '●' },
    })
    expect(typeResponse.ok()).toBe(true)
    const typeId = (await typeResponse.json()).data.id as string
    const eventResponse = await page.request.post('/api/admin/timeline/events', {
      data: {
        title: eventTitle,
        eventTypeId: typeId,
        start: { year: 1920, era: 'CE', month: null, day: null },
        end: null,
        ongoing: false,
        description: '',
        imageUrl: null,
        imageCaption: null,
      },
    })
    expect(eventResponse.ok()).toBe(true)

    await page.goto(timeline.url)
    await page.getByLabel('Найти в базе').fill(eventTitle)
    await page.getByRole('option', { name: new RegExp(eventTitle) }).click()
    await page.getByRole('button', { name: '+ Прикрепить' }).click()

    const canvasEvent = page.getByTestId('timeline-canvas').getByRole('button', { name: eventTitle })
    await expect(canvasEvent).toBeVisible()
    await expect(page.getByTestId('timeline-detail')).toContainText(eventTitle)
    await expect(page.getByRole('button', { name: 'Править' })).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('timeline-canvas').getByRole('button', { name: eventTitle })).toBeVisible()
  })

  test('дорожка эпохи правится на полотне, ставит полосу на нужную строку и переживает reload', async ({
    page,
    createTestTimeline,
    loginAsAdmin,
  }) => {
    const timeline = await createTestTimeline()
    await loginAsAdmin()

    await page.goto(timeline.url)
    const epochBar = page.getByTestId('timeline-canvas').getByRole('button', { name: timeline.epoch.title })
    const epochLayer = page.getByTestId('timeline-epochs')
    await expect(epochBar).toBeVisible()
    await epochBar.click()
    await page.getByRole('button', { name: 'Править' }).click()
    await page.getByTestId('inline-lane').fill('2')
    await page.getByTestId('timeline-inline-editor').getByRole('button', { name: 'Сохранить' }).click()
    await expect(page.getByTestId('timeline-detail-empty')).toBeVisible()

    await page.reload()
    const afterBar = page.getByTestId('timeline-canvas').getByRole('button', { name: timeline.epoch.title })
    await expect(afterBar).toBeVisible()
    const [afterBox, afterLayer] = await Promise.all([afterBar.boundingBox(), epochLayer.boundingBox()])
    expect(afterBox).not.toBeNull()
    expect(afterLayer).not.toBeNull()
    // Дорожка 2 — третья строка слоя эпох, шаг дорожки 26px.
    expect(
      afterBox!.y - afterLayer!.y,
      `Полоса должна встать на дорожку 2: полоса ${JSON.stringify(afterBox)}, слой ${JSON.stringify(afterLayer)}`,
    ).toBe(52)

    const contents = (await (await page.request.get(`/api/admin/timeline/timelines/${timeline.id}/contents`)).json()).data as {
      epochs: Array<{ id: string; pinnedLane: number | null }>
    }
    expect(contents.epochs).toContainEqual(expect.objectContaining({ id: timeline.epoch.id, pinnedLane: 2 }))
  })

  test('прикрепление включает выключенный слой эпох и сохраняется после reload', async ({
    page,
    createTestTimeline,
    loginAsAdmin,
    timelineAdminScope,
  }) => {
    const timeline = await createTestTimeline()
    await loginAsAdmin()
    const epochTitle = timelineAdminScope.name('Неприкреплённая эпоха')
    const epochResponse = await page.request.post('/api/admin/timeline/epochs', {
      data: {
        title: epochTitle,
        start: { year: 1600, era: 'CE', month: null, day: null },
        end: { year: 1700, era: 'CE', month: null, day: null },
        description: '',
        imageUrl: null,
        imageCaption: null,
      },
    })
    expect(epochResponse.ok(), `${epochResponse.status()} ${await epochResponse.text()}`).toBe(true)

    await page.goto(timeline.url)
    await page.getByRole('button', { name: 'Эпохи 1' }).click()
    await expect(page.getByTestId('timeline-epoch')).toHaveCount(0)
    await page.getByLabel('Найти в базе').fill(epochTitle)
    await page.getByRole('option', { name: new RegExp(epochTitle) }).click()
    await page.getByRole('button', { name: '+ Прикрепить' }).click()

    const canvasEpoch = page.getByTestId('timeline-canvas').getByRole('button', { name: epochTitle })
    await expect(canvasEpoch).toBeVisible()
    await expect(page.getByTestId('timeline-detail')).toContainText(epochTitle)
    await expect(page.getByRole('button', { name: 'Править' })).toBeVisible()

    await page.reload()
    await expect(page.getByTestId('timeline-canvas').getByRole('button', { name: epochTitle })).toBeVisible()
  })
})
