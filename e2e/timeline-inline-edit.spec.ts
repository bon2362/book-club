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
    await page.getByRole('button', { name: '+ Событие' }).click()
    await page.getByLabel('Название нового события').fill(title)
    await expect(page.getByTestId('timeline-create-form').getByRole('button', { pressed: true })).toHaveCount(1)
    await page.getByRole('button', { name: 'Создать' }).click()
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
})
