import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

const ADMIN_EMAIL = 'e2e-booktags-admin@test.invalid'
const ADMIN_NAME = 'E2E Book Tags Admin'

test.describe('AdminPanel — выбор тега книги', () => {
  test.setTimeout(120_000) // Админка и e2e setup могут быть медленными в CI

  test.beforeEach(async ({ page }) => {
    await epic('Администрирование')
    await feature('Тег книги')
    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })
  })

  test.afterEach(async ({ page }) => {
    // Книги (и каскадно — signups) удалит фикстура createTestBook в teardown.
    await page.request.delete('/api/test/session', { data: { email: ADMIN_EMAIL } })
  })

  test('тег редактируется через select из существующих и сохраняется после перезагрузки', async ({
    page,
    createTestBook,
  }) => {
    // Две книги с разными тегами — оба тега должны попасть в закрытый набор select'а.
    await createTestBook({ tags: ['Капитализм'] })
    const target = await createTestBook({ tags: ['Государство'] })

    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('admin-tab-catalog').click()
    // НЕ networkidle: каталог рендерит обложки через next/image, недоступный
    // внешний хост держит /_next/image открытым и idle не наступает.
    await page.waitForLoadState('domcontentloaded')

    await expect(page.getByTestId(`admin-book-row-${target.id}`)).toBeVisible()
    await page.getByTestId(`admin-book-expand-${target.id}`).click()
    const editor = page.getByTestId(`admin-book-editor-${target.id}`)
    await expect(editor).toBeVisible()

    // Поле тега — именно <select> (а не свободный ввод): текущее значение книги
    // подхвачено как выбранная опция.
    const tagSelect = editor.getByLabel('Тег')
    await expect(tagSelect).toHaveValue('Государство')

    // Меняем тег на другой существующий (создан выше) — selectOption упал бы,
    // если бы опции не было в закрытом наборе. Текстовые поля редактора
    // стейджатся, PATCH уходит по кнопке «Сохранить».
    await tagSelect.selectOption('Капитализм')
    const patch = page.waitForResponse(
      r => r.url().includes(`/api/admin/books/${target.id}`) && r.request().method() === 'PATCH',
    )
    await editor.getByTestId('admin-book-save').click()
    expect((await patch).ok()).toBe(true)

    // Ключевая проверка: после перезагрузки тег сохранился.
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.getByTestId('admin-tab-catalog').click()
    await expect(page.getByTestId(`admin-book-row-${target.id}`)).toBeVisible()
    await page.getByTestId(`admin-book-expand-${target.id}`).click()
    const editorAfter = page.getByTestId(`admin-book-editor-${target.id}`)
    await expect(editorAfter).toBeVisible()
    await expect(editorAfter.getByLabel('Тег')).toHaveValue('Капитализм')
  })

  test('форма создания предлагает тег из закрытого списка, а не свободный ввод', async ({
    page,
    createTestBook,
  }) => {
    // Книга-источник тега для закрытого набора.
    await createTestBook({ tags: ['Демократия'] })

    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('admin-tab-catalog').click()
    await page.waitForLoadState('domcontentloaded')

    await page.getByTestId('admin-books-create-toggle').click()
    const form = page.getByTestId('admin-books-create-form')
    await expect(form).toBeVisible()

    // Поле тега — <select> с пустым значением по умолчанию и опцией из существующих
    // тегов (точное совпадение по value, чтобы не зависеть от прочих данных ветки).
    const tagSelect = form.getByLabel('Тег')
    await expect(tagSelect).toHaveValue('')
    await expect(tagSelect.locator('option[value="Демократия"]').first()).toBeAttached()
  })
})
