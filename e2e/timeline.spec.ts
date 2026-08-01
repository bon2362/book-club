import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

// Раздел «Ленты времени»: публичное чтение по ссылке без входа, выбор события
// и черновики, видимые только админу. Данные готовит фикстура
// createTestTimeline и удаляет их в teardown.

test.beforeEach(async () => {
  await epic('Лента времени')
  await feature('Публичный просмотр')
})

test.describe('Лента времени — публичный просмотр', () => {
  test('опубликованная лента открывается без входа и показывает события', async ({
    page,
    createTestTimeline,
  }) => {
    const timeline = await createTestTimeline()

    await page.goto(timeline.url)

    await expect(page.getByRole('heading', { level: 1, name: timeline.title })).toBeVisible()
    await expect(page.getByTestId('timeline-canvas')).toBeVisible()
    await expect(
      page.getByTestId('timeline-canvas').getByRole('button', { name: timeline.pointEvent.title }),
    ).toBeVisible()
    await expect(page.getByTestId('timeline-epoch')).toHaveCount(1)
  })

  test('клик по событию показывает карточку с его описанием', async ({ page, createTestTimeline }) => {
    const timeline = await createTestTimeline()

    await page.goto(timeline.url)
    await expect(page.getByTestId('timeline-detail-empty')).toBeVisible()

    await page
      .getByTestId('timeline-canvas')
      .getByRole('button', { name: timeline.pointEvent.title })
      .click()

    const detail = page.getByTestId('timeline-detail')
    await expect(detail).toBeVisible()
    await expect(detail.getByRole('heading', { name: timeline.pointEvent.title })).toBeVisible()
    await expect(detail).toContainText(timeline.pointEvent.description)
  })

  test('клик по эпохе показывает её карточку', async ({ page, createTestTimeline }) => {
    const timeline = await createTestTimeline()

    await page.goto(timeline.url)
    await page.getByTestId('timeline-epoch').first().click()

    const detail = page.getByTestId('timeline-detail')
    await expect(detail.getByRole('heading', { name: timeline.epoch.title })).toBeVisible()
  })

  test('легенда локально скрывает тип событий и сбрасывается после перезагрузки', async ({
    page,
    createTestTimeline,
  }) => {
    const timeline = await createTestTimeline()
    await page.goto(timeline.url)

    const canvasEvents = page.getByTestId('timeline-canvas').getByTestId('timeline-event')
    await expect(canvasEvents).toHaveCount(2)
    const typeChip = page.getByTestId('timeline-legend').locator('button.tl-chip').first()
    await expect(typeChip).toHaveAttribute('aria-pressed', 'true')

    await typeChip.click()
    await expect(typeChip).toHaveAttribute('aria-pressed', 'false')
    await expect(canvasEvents).toHaveCount(0)

    await page.reload()
    await expect(page.getByTestId('timeline-canvas').getByTestId('timeline-event')).toHaveCount(2)
  })

  test('неопубликованная лента неавторизованному отдаёт 404', async ({ page, createTestTimeline }) => {
    const draft = await createTestTimeline({ published: false })

    const response = await page.goto(draft.url)

    expect(response?.status()).toBe(404)
    await expect(page.getByRole('heading', { name: /лента не найдена/i })).toBeVisible()
  })

  test('неопубликованная лента открывается админу с пометкой «черновик»', async ({
    page,
    createTestTimeline,
    loginAsAdmin,
  }) => {
    const draft = await createTestTimeline({ published: false })
    await loginAsAdmin()

    await page.goto(draft.url)

    await expect(page.getByRole('heading', { level: 1, name: draft.title })).toBeVisible()
    await expect(page.getByTestId('timeline-draft-badge')).toBeVisible()
  })

  test('список показывает опубликованную ленту и скрывает черновик', async ({
    page,
    createTestTimeline,
  }) => {
    const published = await createTestTimeline()
    const draft = await createTestTimeline({ published: false })

    await page.goto('/timeline')

    await expect(page.getByTestId('timeline-list-item').filter({ hasText: published.title })).toHaveCount(1)
    await expect(page.getByTestId('timeline-list-item').filter({ hasText: draft.title })).toHaveCount(0)
  })

  test('админу список показывает черновик с пометкой', async ({
    page,
    createTestTimeline,
    loginAsAdmin,
  }) => {
    const draft = await createTestTimeline({ published: false })
    await loginAsAdmin()

    await page.goto('/timeline')

    const row = page.getByTestId('timeline-list-item').filter({ hasText: draft.title })
    await expect(row).toHaveCount(1)
    await expect(row.getByTestId('timeline-draft-badge')).toBeVisible()
  })

  test('выбор события переживает перезагрузку страницы как чистое состояние', async ({
    page,
    createTestTimeline,
  }) => {
    const timeline = await createTestTimeline()

    await page.goto(timeline.url)
    await page
      .getByTestId('timeline-canvas')
      .getByRole('button', { name: timeline.pointEvent.title })
      .click()
    await expect(page.getByTestId('timeline-detail')).toBeVisible()

    // Выбор — состояние просмотра, а не персистентные данные: после
    // перезагрузки лента снова открывается без выбранного элемента.
    await page.reload()

    await expect(page.getByTestId('timeline-detail-empty')).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: timeline.title })).toBeVisible()
  })
})
