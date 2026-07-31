import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

// Вкладка «Ленты времени» в панели администратора: справочники типов, событий
// и эпох плюс переключатель публикации ленты. Всё, что тест заводит через
// интерфейс, помечается префиксом из timelineAdminScope и удаляется в teardown
// вместе с audit-строками; существующие данные не редактируются.

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

  test('админ заводит тип и событие — после перезагрузки оба на месте', async ({
    page,
    loginAsAdmin,
    timelineAdminScope,
  }) => {
    await loginAsAdmin()

    const typeTitle = timelineAdminScope.name('Тип')
    const eventTitle = timelineAdminScope.name('Событие')

    await page.goto('/admin?tab=timeline')
    await expect(page.getByTestId('admin-timeline-panel')).toBeVisible()

    // --- Тип события ---------------------------------------------------
    await page.getByTestId('timeline-section-types').click()
    await page.getByTestId('timeline-add').click()
    await expect(page.getByTestId('timeline-event-type-form')).toBeVisible()

    await page.getByTestId('event-type-title').fill(typeTitle)
    await page.getByTestId('event-type-icon').fill('⚔')
    await page.getByTestId('event-type-color-2D6A4F').click()
    await page.getByTestId('event-type-save').click()

    await expect(page.getByTestId('timeline-types-list')).toBeVisible()
    await expect(
      page.getByTestId('timeline-type-row').filter({ hasText: typeTitle }),
    ).toHaveCount(1)

    // --- Событие этого типа ---------------------------------------------
    await page.getByTestId('timeline-section-events').click()
    await page.getByTestId('timeline-add').click()
    await expect(page.getByTestId('timeline-event-form')).toBeVisible()

    await page.getByTestId('event-title').fill(eventTitle)
    const typeSelect = page.getByTestId('event-type-select')
    const typeValue = await typeSelect
      .locator('option')
      .filter({ hasText: typeTitle })
      .getAttribute('value')
    expect(typeValue).toBeTruthy()
    await typeSelect.selectOption(typeValue as string)

    await page.getByTestId('event-start-year').fill('1917')
    await page.getByTestId('event-start-month').selectOption('11')
    await page.getByTestId('event-start-day').selectOption('7')
    await page.getByTestId('event-description').fill('Описание из E2E-теста.')
    await page.getByTestId('event-save').click()

    await expect(page.getByTestId('timeline-events-list')).toBeVisible()
    await expect(
      page.getByTestId('timeline-event-row').filter({ hasText: eventTitle }),
    ).toHaveCount(1)

    // Перезагрузка: состояние персистентно, а не живёт в памяти вкладки.
    await page.reload()
    await expect(page.getByTestId('admin-timeline-panel')).toBeVisible()

    await page.getByTestId('timeline-section-events').click()
    const eventRow = page.getByTestId('timeline-event-row').filter({ hasText: eventTitle })
    await expect(eventRow).toHaveCount(1)
    await expect(eventRow).toContainText('7 ноября 1917')

    await page.getByTestId('timeline-section-types').click()
    const typeRow = page.getByTestId('timeline-type-row').filter({ hasText: typeTitle })
    await expect(typeRow).toHaveCount(1)
    await expect(typeRow).toContainText('событий: 1')

    // Открытие строки показывает сохранённые значения — правка работает от
    // тех же данных, что записались в базу.
    await eventRowCheck()

    async function eventRowCheck() {
      await page.getByTestId('timeline-section-events').click()
      await page.getByTestId('timeline-event-row').filter({ hasText: eventTitle }).click()
      await expect(page.getByTestId('event-title')).toHaveValue(eventTitle)
      await expect(page.getByTestId('event-start-year')).toHaveValue('1917')
      await expect(page.getByTestId('event-start-day')).toHaveValue('7')
      await page.getByTestId('event-cancel').click()
    }
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
