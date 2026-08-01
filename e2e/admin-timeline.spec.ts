import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

// Сокращённая вкладка «Ленты времени»: типы событий и управление публикацией
// лент. События, эпохи и состав редактируются на самом полотне.

const PLAIN_USER_EMAIL = 'e2e-timeline-admin-plain@test.invalid'

test.describe('AdminPanel — вкладка «Ленты времени»', () => {
  test.setTimeout(120_000)

  test.beforeEach(async () => {
    await epic('Администрирование')
    await feature('Ленты времени')
  })

  test('[SEC] обычный пользователь не видит вкладку и получает 403 от маршрутов', async ({
    page,
  }) => {
    await page.request.post('/api/test/session', {
      data: {
        email: PLAIN_USER_EMAIL,
        name: 'Plain User',
        telegramUsername: 'e2e_timeline_plain',
      },
    })

    for (const url of [
      '/api/admin/timeline/event-types',
      '/api/admin/timeline/events',
      '/api/admin/timeline/epochs',
      '/api/admin/timeline/timelines',
    ]) {
      const res = await page.request.get(url)
      expect(res.status(), url).toBe(403)
    }

    const createRes = await page.request.post('/api/admin/timeline/event-types', {
      data: { title: 'Нельзя', color: '#C0603A', icon: '⚔' },
    })
    expect(createRes.status()).toBe(403)

    await page.goto('/admin?tab=timeline')
    await expect(page.getByTestId('admin-tab-timeline')).toHaveCount(0)
    await expect(page.getByTestId('admin-timeline-panel')).toHaveCount(0)
  })

  test('админ видит только типы и ленты, созданный тип сохраняется после перезагрузки', async ({
    page,
    loginAsAdmin,
    timelineAdminScope,
  }) => {
    await loginAsAdmin()

    const typeTitle = timelineAdminScope.name('Тип')

    await page.goto('/admin?tab=timeline')
    await expect(page.getByTestId('admin-timeline-panel')).toBeVisible()
    await expect(page.getByTestId('timeline-section-events')).toHaveCount(0)
    await expect(page.getByTestId('timeline-section-epochs')).toHaveCount(0)
    await expect(page.getByTestId('timeline-section-types')).toBeVisible()
    await expect(page.getByTestId('timeline-section-timelines')).toBeVisible()

    await page.getByTestId('timeline-add').click()
    await expect(page.getByTestId('timeline-event-type-form')).toBeVisible()

    await page.getByTestId('event-type-title').fill(typeTitle)
    await page.getByTestId('event-type-icon').fill('⚔')
    await page.getByTestId('event-type-color-57795F').click()
    await page.getByTestId('event-type-save').click()

    await expect(page.getByTestId('timeline-types-list')).toBeVisible()
    await expect(
      page.getByTestId('timeline-type-row').filter({ hasText: typeTitle }),
    ).toHaveCount(1)

    // Перезагрузка подтверждает персистентность типа.
    await page.reload()
    await expect(page.getByTestId('admin-timeline-panel')).toBeVisible()
    const typeRow = page.getByTestId('timeline-type-row').filter({ hasText: typeTitle })
    await expect(typeRow).toHaveCount(1)
    await expect(typeRow).toContainText('событий: 0')
  })

  test('удаление используемого типа показывает понятную ошибку, а не падение', async ({
    page,
    loginAsAdmin,
    timelineAdminScope,
  }) => {
    await loginAsAdmin()

    const typeTitle = timelineAdminScope.name('ЗанятыйТип')
    const eventTitle = timelineAdminScope.name('СобытиеЗанятогоТипа')

    // Подготовка через админский API — те же маршруты, что использует форма.
    const typeRes = await page.request.post('/api/admin/timeline/event-types', {
      data: { title: typeTitle, color: '#C0603A', icon: '⚔' },
    })
    expect(typeRes.ok()).toBe(true)
    const typeId = (await typeRes.json()).data.id as string

    const eventRes = await page.request.post('/api/admin/timeline/events', {
      data: {
        title: eventTitle,
        eventTypeId: typeId,
        start: { year: 1917, era: 'CE', month: null, day: null },
      },
    })
    expect(eventRes.ok()).toBe(true)

    await page.goto('/admin?tab=timeline')
    await expect(page.getByTestId('admin-timeline-panel')).toBeVisible()
    await page.getByTestId('timeline-section-types').click()
    await page.getByTestId('timeline-type-row').filter({ hasText: typeTitle }).click()

    await expect(page.getByTestId('timeline-event-type-form')).toBeVisible()
    await page.getByTestId('event-type-delete').click()

    const error = page.getByTestId('event-type-error')
    await expect(error).toBeVisible()
    await expect(error).toContainText('используется в 1 событии')

    // Тип на месте — отказ не сломал данные.
    await page.getByTestId('event-type-cancel').click()
    await expect(
      page.getByTestId('timeline-type-row').filter({ hasText: typeTitle }),
    ).toHaveCount(1)
  })

  test('переключатель публикации: снятая лента отдаёт гостю 404, возвращённая снова открывается', async ({
    page,
    browser,
    loginAsAdmin,
    createTestTimeline,
  }) => {
    const timeline = await createTestTimeline({ published: true })
    await loginAsAdmin()

    await page.goto('/admin?tab=timeline')
    await expect(page.getByTestId('admin-timeline-panel')).toBeVisible()
    await page.getByTestId('timeline-section-timelines').click()

    const row = page.getByTestId('timeline-timeline-row').filter({ hasText: timeline.title })
    await expect(row).toHaveCount(1)
    await expect(row.getByTestId('timeline-published-state')).toHaveText('опубликована')

    // Снимаем с публикации.
    await row.getByTestId('timeline-publish-toggle').click()
    await expect(
      page
        .getByTestId('timeline-timeline-row')
        .filter({ hasText: timeline.title })
        .getByTestId('timeline-published-state'),
    ).toHaveText('черновик')

    const guest = await browser.newContext()
    try {
      const guestPage = await guest.newPage()
      const hidden = await guestPage.goto(timeline.url)
      expect(hidden?.status()).toBe(404)

      // Возвращаем публикацию.
      await page
        .getByTestId('timeline-timeline-row')
        .filter({ hasText: timeline.title })
        .getByTestId('timeline-publish-toggle')
        .click()
      await expect(
        page
          .getByTestId('timeline-timeline-row')
          .filter({ hasText: timeline.title })
          .getByTestId('timeline-published-state'),
      ).toHaveText('опубликована')

      const shown = await guestPage.goto(timeline.url)
      expect(shown?.status()).toBe(200)
      await expect(
        guestPage.getByRole('heading', { level: 1, name: timeline.title }),
      ).toBeVisible()
    } finally {
      await guest.close()
    }
  })
})
