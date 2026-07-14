import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

test.beforeEach(async () => {
  await epic('UI')
  await feature('Состояния интерфейса')
})

test.describe('Home submit book CTA layout', () => {
  test('submit book button is compact on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // На мобильном видим именно мобильный каталог (десктоп-дерево скрыто
    // media-query, но присутствует в DOM) — скоупим на видимый контейнер.
    const box = await page.getByTestId('catalog-mobile').getByTestId('submit-book-card').boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeLessThanOrEqual(96)
  })

  test('book search input uses iOS-safe font size on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const fontSize = await page.getByPlaceholder('Поиск по названию или автору…').evaluate((element) => (
      Number.parseFloat(window.getComputedStyle(element).fontSize)
    ))

    // iOS Safari auto-zooms focused form controls below 16px.
    expect(fontSize).toBeGreaterThanOrEqual(16)
  })

  test('submitted-by-member badge does not create horizontal overflow on mobile tap', async ({
    page,
    createTestBook,
    dbExec,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const book = await createTestBook({
      title: `UI Submitted ${Date.now()}`,
      author: 'Layout Author',
      description: 'A submitted book used to prove the source badge stays inside the mobile viewport.',
    })
    await dbExec('update books set source = $1 where id = $2', ['submission', book.id])

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.getByPlaceholder('Поиск по названию или автору…').fill(book.title)
    await expect(page.getByRole('heading', { name: book.title })).toBeVisible()

    const submittedBadge = page.getByTestId('catalog-mobile').locator('[aria-label="Эта книга предложена участни:цей клуба"]')
    await submittedBadge.click()

    const tooltip = page.getByTestId('catalog-mobile').getByTestId('submitted-book-tooltip')
    await expect(tooltip).toBeVisible()
    await submittedBadge.click()
    await expect(tooltip).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)

    const tooltipBox = await tooltip.boundingBox()
    const viewport = page.viewportSize()!
    expect(tooltipBox).not.toBeNull()
    expect(tooltipBox!.x).toBeGreaterThanOrEqual(0)
    expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(viewport.width)
  })
})

test.describe('BookCardMobile: responsive layout', () => {
  test('на мобильном (390×800) каталог-мобайл виден, каталог-десктоп и переключатель вида скрыты', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // catalog-mobile виден: boundingBox не null и в области просмотра
    const mobileBox = await page.getByTestId('catalog-mobile').boundingBox()
    expect(mobileBox).not.toBeNull()
    expect(mobileBox!.height).toBeGreaterThan(0)

    // catalog-desktop скрыт: display none → boundingBox null
    const desktopBox = await page.getByTestId('catalog-desktop').boundingBox()
    expect(desktopBox).toBeNull()

    // filters-view-toggle скрыт
    const toggleBox = await page.locator('.filters-view-toggle').boundingBox()
    expect(toggleBox).toBeNull()

    // В мобильном каталоге присутствует хотя бы одна мобильная карточка
    const cards = page.getByTestId('book-card-mobile')
    expect(await cards.count()).toBeGreaterThan(0)
  })

  test('на десктопе (1280×900) каталог-десктоп виден, каталог-мобайл скрыт', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // catalog-desktop виден
    const desktopBox = await page.getByTestId('catalog-desktop').boundingBox()
    expect(desktopBox).not.toBeNull()
    expect(desktopBox!.height).toBeGreaterThan(0)

    // catalog-mobile скрыт: display none → boundingBox null
    const mobileBox = await page.getByTestId('catalog-mobile').boundingBox()
    expect(mobileBox).toBeNull()

    // переключатель вида виден на десктопе
    const toggleBox = await page.locator('.filters-view-toggle').boundingBox()
    expect(toggleBox).not.toBeNull()
  })
})
