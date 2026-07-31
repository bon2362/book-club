import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

// Геометрия ленты: раскладка событий по дорожкам не должна давать наложений,
// подпись эпохи обязана оставаться внутри своей полосы, а на узком экране
// полотно уступает место вертикальному списку.

test.beforeEach(async () => {
  await epic('UI')
  await feature('Состояния интерфейса')
})

test.describe('Лента времени — геометрия', () => {
  test('подписи соседних событий не накладываются друг на друга', async ({
    page,
    createTestTimeline,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const timeline = await createTestTimeline()

    await page.goto(timeline.url)
    await expect(page.getByTestId('timeline-canvas')).toBeVisible()

    const labels = page.getByTestId('timeline-canvas').getByTestId('timeline-event-label')
    const count = await labels.count()
    expect(count).toBeGreaterThanOrEqual(2)

    const boxes = []
    for (let index = 0; index < count; index += 1) {
      const box = await labels.nth(index).boundingBox()
      expect(box).not.toBeNull()
      boxes.push(box!)
    }

    // Две подписи пересекаются, только если пересекаются и по горизонтали, и
    // по вертикали. Раскладка обязана развести их хотя бы по одной оси.
    for (let left = 0; left < boxes.length; left += 1) {
      for (let right = left + 1; right < boxes.length; right += 1) {
        const a = boxes[left]
        const b = boxes[right]
        const overlapX = a.x < b.x + b.width && b.x < a.x + a.width
        const overlapY = a.y < b.y + b.height && b.y < a.y + a.height
        expect(overlapX && overlapY).toBe(false)
      }
    }
  })

  // Дефект: у правого края подпись уходила за полотно и обрезалась
  // `overflow: hidden`. Теперь ряд разворачивается влево.
  test('подписи событий не выходят за правый край полотна', async ({
    page,
    createTestTimeline,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const timeline = await createTestTimeline()

    await page.goto(timeline.url)
    const canvas = page.getByTestId('timeline-canvas')
    await expect(canvas).toBeVisible()

    const canvasBox = await canvas.boundingBox()
    expect(canvasBox).not.toBeNull()

    const labels = canvas.getByTestId('timeline-event-label')
    const count = await labels.count()
    expect(count).toBeGreaterThanOrEqual(1)

    for (let index = 0; index < count; index += 1) {
      const box = await labels.nth(index).boundingBox()
      expect(box).not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(canvasBox!.x - 1)
      expect(box!.x + box!.width).toBeLessThanOrEqual(canvasBox!.x + canvasBox!.width + 1)
    }
  })

  test('подпись эпохи остаётся внутри своей полосы', async ({ page, createTestTimeline }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const timeline = await createTestTimeline()

    await page.goto(timeline.url)
    const band = page.getByTestId('timeline-epoch').first()
    await expect(band).toBeVisible()

    const bandBox = await band.boundingBox()
    const labelBox = await band.getByTestId('timeline-epoch-label').boundingBox()
    expect(bandBox).not.toBeNull()
    expect(labelBox).not.toBeNull()

    // Подпись целиком внутри полосы: label.left ≥ band.left и
    // label.right ≤ band.right (допуск 1px на субпиксельное округление).
    expect(labelBox!.x).toBeGreaterThanOrEqual(bandBox!.x - 1)
    expect(labelBox!.x + labelBox!.width).toBeLessThanOrEqual(bandBox!.x + bandBox!.width + 1)
  })

  test('полоса эпохи шире, чем отрезок события внутри неё', async ({ page, createTestTimeline }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const timeline = await createTestTimeline()

    await page.goto(timeline.url)

    // Эпоха фикстуры (1900–1950) перекрывает интервал события (1914–1918),
    // значит её полоса обязана быть шире отрезка события.
    const bandBox = await page.getByTestId('timeline-epoch').first().boundingBox()
    const intervalBox = await page
      .getByTestId('timeline-canvas')
      .getByRole('button', { name: timeline.intervalEvent.title })
      .boundingBox()

    expect(bandBox).not.toBeNull()
    expect(intervalBox).not.toBeNull()
    expect(bandBox!.width).toBeGreaterThan(intervalBox!.width)
  })

  test('на 375 px лента скрыта, виден вертикальный список', async ({ page, createTestTimeline }) => {
    const timeline = await createTestTimeline()
    await page.setViewportSize({ width: 375, height: 812 })

    await page.goto(timeline.url)

    await expect(page.getByTestId('timeline-mobile-list')).toBeVisible()
    await expect(page.getByTestId('timeline-canvas')).toBeHidden()
    // Список идёт по хронологии: интервал 1914–1918 стоит раньше точки 1917.
    const items = page.getByTestId('timeline-mobile-event')
    await expect(items.first()).toContainText(timeline.intervalEvent.title)
    await expect(items.filter({ hasText: timeline.pointEvent.title })).toHaveCount(1)
  })

  test('на 1280 px видна лента, вертикальный список скрыт', async ({ page, createTestTimeline }) => {
    const timeline = await createTestTimeline()
    await page.setViewportSize({ width: 1280, height: 800 })

    await page.goto(timeline.url)

    await expect(page.getByTestId('timeline-canvas')).toBeVisible()
    await expect(page.getByTestId('timeline-mobile-list')).toBeHidden()
  })
})
