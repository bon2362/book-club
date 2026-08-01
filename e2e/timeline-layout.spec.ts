import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'
import type { Locator } from '@playwright/test'

// Геометрия ленты: раскладка событий по дорожкам не должна давать наложений,
// подпись эпохи обязана оставаться внутри своей полосы, а на узком экране
// полотно уступает место вертикальному списку.

test.beforeEach(async () => {
  await epic('UI')
  await feature('Состояния интерфейса')
})

async function expectEventLabelsNotToOverlap(canvas: Locator): Promise<void> {
  const labels = canvas.getByTestId('timeline-event-label')
  const count = await labels.count()
  expect(count).toBeGreaterThanOrEqual(2)

  const boxes = []
  for (let index = 0; index < count; index += 1) {
    const box = await labels.nth(index).boundingBox()
    expect(box).not.toBeNull()
    boxes.push(box!)
  }

  for (let left = 0; left < boxes.length; left += 1) {
    for (let right = left + 1; right < boxes.length; right += 1) {
      const a = boxes[left]
      const b = boxes[right]
      const overlapX = a.x < b.x + b.width && b.x < a.x + a.width
      const overlapY = a.y < b.y + b.height && b.y < a.y + a.height
      expect(overlapX && overlapY).toBe(false)
    }
  }
}

interface EventLabelBox {
  text: string
  x: number
  y: number
  width: number
  height: number
}

async function eventLabelBoxes(canvas: Locator): Promise<EventLabelBox[]> {
  return canvas.getByTestId('timeline-event-label').evaluateAll((labels) => labels
    .map((label) => {
      const box = label.getBoundingClientRect()
      return {
        text: label.textContent ?? '',
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
      }
    })
    .sort((left, right) => left.text.localeCompare(right.text)))
}

function expectSameLabelPositions(before: EventLabelBox[], after: EventLabelBox[]): void {
  expect(after).toHaveLength(before.length)
  before.forEach((box, index) => {
    expect(after[index]?.text).toBe(box.text)
    expect(after[index]?.x).toBeCloseTo(box.x, 4)
    expect(after[index]?.y).toBeCloseTo(box.y, 4)
  })
}

test.describe('Лента времени — геометрия', () => {
  test('подписи соседних событий не накладываются друг на друга', async ({
    page,
    createTestTimeline,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const timeline = await createTestTimeline()

    await page.goto(timeline.url)
    const canvas = page.getByTestId('timeline-canvas')
    await expect(canvas).toBeVisible()
    await expectEventLabelsNotToOverlap(canvas)

    await page.getByRole('button', { name: 'Приблизить' }).click()
    await page.getByRole('button', { name: 'Приблизить' }).click()
    await expectEventLabelsNotToOverlap(canvas)
  })

  test('панорамирование сдвигает все подписи одинаково и не меняет дорожки', async ({
    page,
    createTestTimeline,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const timeline = await createTestTimeline()
    await page.goto(timeline.url)

    const canvas = page.getByTestId('timeline-canvas')
    await expect(canvas).toBeVisible()
    const before = await eventLabelBoxes(canvas)
    expect(before).toHaveLength(2)

    await canvas.hover()
    await page.mouse.wheel(240, 0)
    await expect.poll(async () => (await eventLabelBoxes(canvas))[0]?.x).not.toBe(before[0]?.x)
    const after = await eventLabelBoxes(canvas)

    expect(after).toHaveLength(before.length)
    const shifts = before.map((box, index) => after[index]!.x - box.x)
    shifts.forEach((shift) => expect(shift).toBeCloseTo(shifts[0]!, 4))
    before.forEach((box, index) => expect(after[index]?.y).toBeCloseTo(box.y, 4))
  })

  test('переключение типа не двигает подписи оставшегося типа', async ({
    page,
    createTestTimeline,
    loginAsAdmin,
    timelineAdminScope,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const timeline = await createTestTimeline()
    await loginAsAdmin()

    const secondTypeTitle = timelineAdminScope.name('Второй тип')
    const typeResponse = await page.request.post('/api/admin/timeline/event-types', {
      data: { title: secondTypeTitle, color: '#57795F', icon: '◆' },
    })
    expect(typeResponse.ok()).toBe(true)
    const typeId = (await typeResponse.json()).data.id as string
    const patchResponse = await page.request.patch(
      `/api/admin/timeline/events/${timeline.pointEvent.id}`,
      {
        data: {
          title: timeline.pointEvent.title,
          eventTypeId: typeId,
          start: { year: 1917, era: 'CE', month: null, day: null },
          end: null,
          ongoing: false,
          description: timeline.pointEvent.description,
          imageUrl: null,
          imageCaption: null,
        },
      },
    )
    expect(patchResponse.ok()).toBe(true)

    await page.goto(timeline.url)
    const canvas = page.getByTestId('timeline-canvas')
    const interval = canvas.getByRole('button', { name: timeline.intervalEvent.title })
    const intervalLabel = interval.getByTestId('timeline-event-label')
    const before = await intervalLabel.boundingBox()
    expect(before).not.toBeNull()

    const secondTypeChip = page
      .getByTestId('timeline-legend')
      .locator('button.tl-chip')
      .filter({ hasText: secondTypeTitle })
    await expect(secondTypeChip).toHaveCount(1)
    await secondTypeChip.click()
    await expect(canvas.getByRole('button', { name: timeline.pointEvent.title })).toHaveCount(0)
    const after = await intervalLabel.boundingBox()

    expect(after).not.toBeNull()
    expect(after!.x).toBeCloseTo(before!.x, 4)
    expect(after!.y).toBeCloseTo(before!.y, 4)
  })

  test('переключение эпох не двигает ось и подписи событий', async ({
    page,
    createTestTimeline,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const timeline = await createTestTimeline()
    await page.goto(timeline.url)

    const canvas = page.getByTestId('timeline-canvas')
    const beforeLabels = await eventLabelBoxes(canvas)
    const beforeRuler = await page.getByTestId('timeline-ruler').boundingBox()
    const beforeEpochLayer = await page.getByTestId('timeline-epochs').boundingBox()
    expect(beforeRuler).not.toBeNull()
    expect(beforeEpochLayer).not.toBeNull()

    await page.getByRole('button', { name: 'Эпохи 1' }).click()
    await expect(page.getByTestId('timeline-epoch')).toHaveCount(0)
    const afterLabels = await eventLabelBoxes(canvas)
    const afterRuler = await page.getByTestId('timeline-ruler').boundingBox()
    const afterEpochLayer = await page.getByTestId('timeline-epochs').boundingBox()

    expectSameLabelPositions(beforeLabels, afterLabels)
    expect(afterRuler?.y).toBeCloseTo(beforeRuler!.y, 4)
    expect(afterEpochLayer?.height).toBeCloseTo(beforeEpochLayer!.height, 4)
  })

  test('изменение масштаба вправе менять координаты подписей', async ({
    page,
    createTestTimeline,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const timeline = await createTestTimeline()
    await page.goto(timeline.url)

    const canvas = page.getByTestId('timeline-canvas')
    const before = await eventLabelBoxes(canvas)
    await page.getByRole('button', { name: 'Приблизить' }).click()
    await expect.poll(async () => (await eventLabelBoxes(canvas))[0]?.x).not.toBe(before[0]?.x)

    expect(await eventLabelBoxes(canvas)).not.toEqual(before)
  })

  test('полностью ушедшие за край события отсутствуют в DOM', async ({
    page,
    createTestTimeline,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const timeline = await createTestTimeline()
    await page.goto(timeline.url)

    const canvas = page.getByTestId('timeline-canvas')
    const events = canvas.getByTestId('timeline-event')
    const pointEvent = canvas.getByRole('button', { name: timeline.pointEvent.title })
    const canvasBox = await canvas.boundingBox()
    expect(canvasBox).not.toBeNull()
    await expect(events).toHaveCount(2)
    await canvas.hover()

    let pointIsPastLeftEdge = false
    for (let step = 0; step < 30; step += 1) {
      await page.mouse.wheel(20, 0)
      const pointBox = await pointEvent.boundingBox()
      if (pointBox !== null && pointBox.x + pointBox.width < canvasBox!.x) {
        pointIsPastLeftEdge = true
        break
      }
    }

    expect(pointIsPastLeftEdge).toBe(true)
    const visibleLabelBox = await pointEvent.getByTestId('timeline-event-label').boundingBox()
    expect(visibleLabelBox).not.toBeNull()
    expect(visibleLabelBox!.x + visibleLabelBox!.width).toBeGreaterThan(canvasBox!.x)

    await page.mouse.wheel(2400, 0)

    await expect(events).toHaveCount(0)
  })

  test.describe('hover и выбор', () => {
    test('точечное событие сохраняет геометрию подписи и одинаково подсвечивается', async ({
      page,
      createTestTimeline,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      const timeline = await createTestTimeline()
      await page.goto(timeline.url)

      const canvas = page.getByTestId('timeline-canvas')
      const event = canvas.getByRole('button', { name: timeline.pointEvent.title })
      const label = event.getByTestId('timeline-event-label')
      const before = await label.boundingBox()
      expect(before).not.toBeNull()

      await event.hover()
      await expect(event).toHaveClass(/(^|\s)is-on(\s|$)/)
      await expect(page.getByRole('tooltip')).toHaveCount(0)
      const hovered = await label.boundingBox()
      expect(hovered).not.toBeNull()
      expect(hovered!.x).toBeCloseTo(before!.x, 4)
      expect(hovered!.y).toBeCloseTo(before!.y, 4)
      expect(hovered!.width).toBeCloseTo(before!.width, 4)

      const axisDot = canvas.getByTestId('timeline-axis-dot')
      const eventBox = await event.boundingBox()
      const axisDotBox = await axisDot.boundingBox()
      expect(eventBox).not.toBeNull()
      expect(axisDotBox).not.toBeNull()
      expect(axisDotBox!.x + axisDotBox!.width / 2)
        .toBeCloseTo(eventBox!.x + eventBox!.width / 2, 4)

      const hoverClass = await event.getAttribute('class')
      await event.click()
      await page.mouse.move(0, 0)
      await expect(event).toHaveAttribute('class', hoverClass!)
    })

    test('интервал тянет активную область от линии до оси и сбрасывает hover колесом', async ({
      page,
      createTestTimeline,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      const timeline = await createTestTimeline()
      await page.goto(timeline.url)

      const canvas = page.getByTestId('timeline-canvas')
      const interval = canvas.getByRole('button', { name: timeline.intervalEvent.title })
      const connector = interval.locator('xpath=preceding-sibling::*[contains(@class, "tl-connector")][1]')
      const connectorBackground = await connector
        .evaluate((element) => getComputedStyle(element).backgroundImage)
      expect(connectorBackground).toContain('linear-gradient')
      await interval.hover()
      await expect(interval).toHaveClass(/(^|\s)is-on(\s|$)/)

      const intervalBox = await interval.boundingBox()
      const areaBox = await canvas.getByTestId('timeline-span-area').boundingBox()
      expect(intervalBox).not.toBeNull()
      expect(areaBox).not.toBeNull()
      expect(areaBox!.x).toBeCloseTo(intervalBox!.x, 4)
      expect(areaBox!.width).toBeCloseTo(intervalBox!.width, 4)
      expect(areaBox!.y).toBeCloseTo(intervalBox!.y + intervalBox!.height, 4)

      const line = interval.locator('.tl-span-rule')
      const lineBox = await line.boundingBox()
      expect(lineBox).not.toBeNull()
      const topElementClass = await page.evaluate(({ x, y }) =>
        document.elementFromPoint(x, y)?.className,
      {
        x: lineBox!.x + lineBox!.width / 2,
        y: lineBox!.y + lineBox!.height / 2,
      })
      expect(topElementClass).toContain('tl-span-rule')

      await expect(connector).toHaveClass(/(^|\s)is-on(\s|$)/)

      await page.mouse.wheel(1, 0)
      await expect(interval).not.toHaveClass(/(^|\s)is-on(\s|$)/)
      await expect(canvas.getByTestId('timeline-span-area')).toHaveCount(0)
    })

    test('эпоха использует одинаковое состояние для hover и выбора без tooltip', async ({
      page,
      createTestTimeline,
    }) => {
      await page.setViewportSize({ width: 1280, height: 800 })
      const timeline = await createTestTimeline()
      await page.goto(timeline.url)

      const epoch = page.getByTestId('timeline-epoch')
      await expect(epoch).toHaveCount(1)
      await epoch.hover()
      await expect(epoch).toHaveClass(/(^|\s)is-on(\s|$)/)
      await expect(page.getByRole('tooltip')).toHaveCount(0)

      const hoverClass = await epoch.getAttribute('class')
      await epoch.click()
      await page.mouse.move(0, 0)
      await expect(epoch).toHaveAttribute('class', hoverClass!)
    })
  })

  test('на высоком экране расстояние между занятыми дорожками становится больше базового', async ({ page, createTestTimeline }) => {
    await page.setViewportSize({ width: 1400, height: 1000 })
    const timeline = await createTestTimeline()
    await page.goto(timeline.url)

    const canvas = page.getByTestId('timeline-events')
    const labels = canvas.getByTestId('timeline-event-label')
    const canvasBox = await canvas.boundingBox()
    const labelBoxes = await labels.evaluateAll((items) => items.map((item) => item.getBoundingClientRect().toJSON()))
    expect(canvasBox).not.toBeNull()
    expect(labelBoxes.length).toBeGreaterThanOrEqual(2)

    expect(Math.abs(labelBoxes[0]!.y - labelBoxes[1]!.y)).toBeGreaterThan(44)
  })

  test('сегодня пересекает полотно и эпохи, а продолжающийся интервал заканчивается на этой линии', async ({
    page,
    createTestTimeline,
    dbExec,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 })
    const timeline = await createTestTimeline()
    await dbExec(
      'update historical_events set end_year = null, end_era = null, ongoing = true where id = $1',
      [timeline.intervalEvent.id],
    )

    await page.goto(timeline.url)
    const canvas = page.getByTestId('timeline-canvas')
    const today = canvas.getByTestId('timeline-now')
    const future = canvas.getByTestId('timeline-future')
    const interval = canvas.getByRole('button', { name: timeline.intervalEvent.title })
    await expect(today).toBeVisible()
    await expect(future).toBeVisible()

    const [todayBox, futureBox, intervalBox, epochsBox] = await Promise.all([
      today.boundingBox(),
      future.boundingBox(),
      interval.boundingBox(),
      page.getByTestId('timeline-epochs').boundingBox(),
    ])
    expect(todayBox).not.toBeNull()
    expect(futureBox).not.toBeNull()
    expect(intervalBox).not.toBeNull()
    expect(epochsBox).not.toBeNull()
    expect(intervalBox!.x + intervalBox!.width).toBeCloseTo(todayBox!.x, 1)
    expect(futureBox!.x).toBeCloseTo(todayBox!.x, 1)
    expect(todayBox!.y + todayBox!.height).toBeGreaterThanOrEqual(epochsBox!.y + epochsBox!.height - 1)
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
    await page.setViewportSize({ width: 375, height: 400 })

    await page.goto(timeline.url)

    await expect(page.getByTestId('timeline-mobile-list')).toBeVisible()
    await expect(page.getByTestId('timeline-canvas')).toBeHidden()
    // Список идёт по хронологии: интервал 1914–1918 стоит раньше точки 1917.
    const items = page.getByTestId('timeline-mobile-event')
    await expect(items.first()).toContainText(timeline.intervalEvent.title)
    await expect(items.filter({ hasText: timeline.pointEvent.title })).toHaveCount(1)
    expect(await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight)).toBe(true)
  })

  test('клик по видимому событию не меняет диапазон', async ({ page, createTestTimeline }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    const timeline = await createTestTimeline()
    await page.goto(timeline.url)

    const rulerTicks = page.getByTestId('timeline-ruler').locator(':scope > div > span')
    const snapshot = () => rulerTicks.evaluateAll((ticks) => ticks.map((tick) => ({
      left: (tick as HTMLElement).style.left,
      text: tick.textContent,
    })))
    const before = await snapshot()

    await page
      .getByTestId('timeline-canvas')
      .getByRole('button', { name: timeline.pointEvent.title })
      .click()
    await expect(page.getByTestId('timeline-detail')).toBeVisible()

    expect(await snapshot()).toEqual(before)
  })

  test('на 1280 px видна лента, вертикальный список скрыт', async ({ page, createTestTimeline }) => {
    const timeline = await createTestTimeline()
    await page.setViewportSize({ width: 1280, height: 800 })

    await page.goto(timeline.url)

    await expect(page.getByTestId('timeline-canvas')).toBeVisible()
    await expect(page.getByTestId('timeline-mobile-list')).toBeHidden()
  })
})
