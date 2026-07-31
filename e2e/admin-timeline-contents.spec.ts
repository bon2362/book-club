import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

// Сборка ленты: создание подборки, включение в неё событий и эпох, локальная
// заметка и оформление эпохи. Всё, что тест заводит, помечается префиксом из
// timelineAdminScope и удаляется в teardown; существующие данные не трогаются.

test.describe('AdminPanel — состав ленты времени', () => {
  test.setTimeout(120_000)

  test.beforeEach(async () => {
    await epic('Администрирование')
    await feature('Ленты времени')
  })

  test('лента собирается из общей базы и доезжает до публичной страницы', async ({
    page,
    loginAsAdmin,
    timelineAdminScope,
  }) => {
    await loginAsAdmin()

    const typeTitle = timelineAdminScope.name('Тип')
    const eventTitle = timelineAdminScope.name('Событие')
    const timelineTitle = timelineAdminScope.name('Лента')

    await page.goto('/admin?tab=timeline')
    await expect(page.getByTestId('admin-timeline-panel')).toBeVisible()

    // --- Справочники: тип и событие -------------------------------------
    await page.getByTestId('timeline-section-types').click()
    await page.getByTestId('timeline-add').click()
    await page.getByTestId('event-type-title').fill(typeTitle)
    await page.getByTestId('event-type-icon').fill('★')
    await page.getByTestId('event-type-save').click()
    await expect(page.getByTestId('timeline-types-list')).toBeVisible()

    await page.getByTestId('timeline-section-events').click()
    await page.getByTestId('timeline-add').click()
    await page.getByTestId('event-title').fill(eventTitle)
    const typeSelect = page.getByTestId('event-type-select')
    const typeValue = await typeSelect
      .locator('option')
      .filter({ hasText: typeTitle })
      .getAttribute('value')
    expect(typeValue).toBeTruthy()
    await typeSelect.selectOption(typeValue as string)
    await page.getByTestId('event-start-year').fill('1789')
    await page.getByTestId('event-save').click()
    await expect(page.getByTestId('timeline-events-list')).toBeVisible()

    // --- Сама лента ------------------------------------------------------
    await page.getByTestId('timeline-section-timelines').click()
    await page.getByTestId('timeline-add').click()
    await expect(page.getByTestId('timeline-form')).toBeVisible()
    await page.getByTestId('timeline-title').fill(timelineTitle)

    const slugField = page.getByTestId('timeline-slug')
    const slug = `e2e-contents-${Date.now()}`
    await slugField.fill(slug)
    await page.getByTestId('timeline-form-save').click()

    const timelineRow = page.getByTestId('timeline-timeline-row').filter({ hasText: timelineTitle })
    await expect(timelineRow).toHaveCount(1)

    // --- Состав: включаем событие ---------------------------------------
    await timelineRow.getByTestId('timeline-open-contents').click()
    await expect(page.getByTestId('timeline-contents')).toBeVisible()

    await page.getByTestId('contents-search-available').fill(eventTitle)
    const availableRow = page
      .getByTestId('contents-available-row')
      .filter({ hasText: eventTitle })
    await expect(availableRow).toHaveCount(1)
    await availableRow.getByTestId('contents-include').click()

    const includedRow = page
      .getByTestId('contents-included-row')
      .filter({ hasText: eventTitle })
    await expect(includedRow).toHaveCount(1)

    // --- Локальная заметка ------------------------------------------------
    await includedRow.getByTestId('contents-open-membership').click()
    await expect(page.getByTestId('membership-detail')).toBeVisible()
    await page.getByTestId('membership-note').fill('Заметка только для этой ленты.')
    await page.getByTestId('membership-save').click()
    await expect(page.getByTestId('membership-detail')).toHaveCount(0)

    // Перезагрузка: состав и заметка живут в базе, а не в памяти вкладки.
    await page.reload()
    await expect(page.getByTestId('admin-timeline-panel')).toBeVisible()
    await page.getByTestId('timeline-section-timelines').click()
    await page
      .getByTestId('timeline-timeline-row')
      .filter({ hasText: timelineTitle })
      .getByTestId('timeline-open-contents')
      .click()

    const includedAfterReload = page
      .getByTestId('contents-included-row')
      .filter({ hasText: eventTitle })
    await expect(includedAfterReload).toHaveCount(1)
    await includedAfterReload.getByTestId('contents-open-membership').click()
    await expect(page.getByTestId('membership-note')).toHaveValue(
      'Заметка только для этой ленты.',
    )
    await page.getByTestId('membership-cancel').click()

    // --- Публичная страница ----------------------------------------------
    await page.getByTestId('contents-back').click()
    await page
      .getByTestId('timeline-timeline-row')
      .filter({ hasText: timelineTitle })
      .getByTestId('timeline-publish-toggle')
      .click()

    await page.goto(`/timeline/${slug}`)
    await expect(page.getByRole('heading', { name: timelineTitle })).toBeVisible()
    await expect(
      page.getByTestId('timeline-canvas').getByTestId('timeline-event'),
    ).toHaveCount(1)
  })

  test('исключение события из ленты не удаляет его из общей базы', async ({
    page,
    loginAsAdmin,
    timelineAdminScope,
  }) => {
    await loginAsAdmin()

    const typeTitle = timelineAdminScope.name('Тип')
    const eventTitle = timelineAdminScope.name('Событие')
    const timelineTitle = timelineAdminScope.name('Лента')

    // Данные готовим через те же маршруты, которые дёргает форма.
    const typeRes = await page.request.post('/api/admin/timeline/event-types', {
      data: { title: typeTitle, color: '#2D6A4F', icon: '★' },
    })
    expect(typeRes.ok(), `${typeRes.status()} ${await typeRes.text()}`).toBe(true)
    const typeId = (await typeRes.json()).data.id as string

    const eventRes = await page.request.post('/api/admin/timeline/events', {
      data: {
        title: eventTitle,
        eventTypeId: typeId,
        start: { year: 1815, era: 'CE' },
        end: null,
        ongoing: false,
        description: '',
        // end/imageUrl/imageCaption обязаны присутствовать, хотя и допускают
        // null: в схеме преобразование стоит после .nullish(), из-за чего zod
        // считает ключ обязательным. Формы шлют все поля, поэтому вживую это
        // не всплывает.
        imageUrl: null,
        imageCaption: null,
      },
    })
    expect(eventRes.ok(), `${eventRes.status()} ${await eventRes.text()}`).toBe(true)

    const timelineRes = await page.request.post('/api/admin/timeline/timelines', {
      data: {
        title: timelineTitle,
        slug: `e2e-keep-${Date.now()}`,
        description: '',
      },
    })
    expect(timelineRes.ok(), `${timelineRes.status()} ${await timelineRes.text()}`).toBe(true)
    const timelineId = (await timelineRes.json()).data.id as string

    await page.goto('/admin?tab=timeline')
    await page.getByTestId('timeline-section-timelines').click()
    await page
      .getByTestId('timeline-timeline-row')
      .filter({ hasText: timelineTitle })
      .getByTestId('timeline-open-contents')
      .click()

    await page.getByTestId('contents-search-available').fill(eventTitle)
    await page
      .getByTestId('contents-available-row')
      .filter({ hasText: eventTitle })
      .getByTestId('contents-include')
      .click()

    const included = page.getByTestId('contents-included-row').filter({ hasText: eventTitle })
    await expect(included).toHaveCount(1)
    await included.getByTestId('contents-exclude').click()
    await expect(included).toHaveCount(0)

    // Событие обязано остаться в справочнике: подборка — это только ссылки.
    const listRes = await page.request.get('/api/admin/timeline/events')
    expect(listRes.ok()).toBe(true)
    const events = (await listRes.json()).data as Array<{ title: string }>
    expect(events.some((row) => row.title === eventTitle)).toBe(true)

    await page.request.delete(`/api/admin/timeline/timelines/${timelineId}`)
  })
})
