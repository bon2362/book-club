/**
 * E2E тест: редактирование описания тега в админке → отображение в каталоге книг.
 *
 * Что проверяем:
 * 1. Авторизованный admin может открыть вкладку "Теги"
 * 2. Найти тег "государство", изменить описание, сохранить
 * 3. Убедиться что кнопка показала "Сохранено"
 * 4. На странице /books → выбрать тег "государство" в фильтре
 * 5. Убедиться что новое описание отображается под фильтром
 *
 * После теста описание восстанавливается к исходному значению.
 */
import { test, expect } from './fixtures'

const TEST_EMAIL = 'e2e-tags-admin@test.invalid'
const TEST_NAME = 'E2E Tags Admin'
const TARGET_TAG = 'государство'
const TIMESTAMP = Date.now()
const NEW_DESCRIPTION = `Тестовое описание — автотест ${TIMESTAMP}`

let originalDescription = ''

test.describe('Редактирование тега в админке', () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/test/session', {
      data: { email: TEST_EMAIL, name: TEST_NAME, isAdmin: true },
    })
  })

  test.afterEach(async ({ page }) => {
    // Восстанавливаем исходное описание тега
    await page.request.post('/api/admin/tag-description', {
      data: { tag: TARGET_TAG, description: originalDescription },
    })
    // Удаляем тестового пользователя
    await page.request.delete('/api/test/session', {
      data: { email: TEST_EMAIL },
    })
  })

  test(`изменение описания тега "${TARGET_TAG}" отображается в каталоге`, async ({ page, createTestBook }) => {
    // Тег появляется в админке/фильтре только если им помечена хотя бы одна
    // опубликованная книга. Создаём такую через фикстуру (auto-удалится).
    await createTestBook({ tags: [TARGET_TAG] })

    // ── Шаг 1: Admin panel → вкладка "Теги" ─────────────────────────────
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL('/admin', { timeout: 5000 })

    // Нажимаем вкладку "Теги"
    await page.getByRole('button', { name: /теги/i }).click()

    // Ждём что теги отрисовались (ищем textarea)
    await expect(page.locator('textarea').first()).toBeVisible({ timeout: 5000 })

    // ── Шаг 2: Находим блок тега "государство" ──────────────────────────
    const tagBlock = page.getByTestId(`tag-block-${TARGET_TAG}`)
    await expect(tagBlock).toBeVisible({ timeout: 5000 })

    const textarea = tagBlock.locator('textarea')
    await expect(textarea).toBeVisible()

    // Сохраняем текущее описание (для восстановления в afterEach)
    originalDescription = await textarea.inputValue()
    console.log(`📋 Текущее описание тега "${TARGET_TAG}": "${originalDescription || '(пусто)'}"`)

    // ── Шаг 3: Вводим новое описание ────────────────────────────────────
    await textarea.fill(NEW_DESCRIPTION)
    console.log(`✏️  Новое описание: "${NEW_DESCRIPTION}"`)

    // ── Шаг 4: Нажимаем "Сохранить" ─────────────────────────────────────
    const saveButton = tagBlock.getByRole('button', { name: /сохранить/i })
    await saveButton.click()

    // Ждём появления "Сохранено" (span появляется после успешного сохранения)
    await expect(tagBlock.getByText(/сохранено/i)).toBeVisible({ timeout: 8000 })
    console.log(`✅ Сохранено в admin panel`)

    // ── Шаг 5: Открываем каталог книг (главная страница) ────────────────
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // ── Шаг 6: Выбираем тег в фильтре ───────────────────────────────────
    // BooksPage.tsx: <select class="filters-select-tag">
    const tagSelect = page.locator('select.filters-select-tag')
    await expect(tagSelect).toBeVisible({ timeout: 5000 })

    await tagSelect.selectOption(TARGET_TAG)
    await page.waitForLoadState('networkidle')

    console.log(`🏷️  Выбран тег "${TARGET_TAG}" в фильтре`)

    // ── Шаг 7: Проверяем отображение описания ───────────────────────────
    // BooksPage.tsx строки 410-428: <p> с текстом описания под фильтрами
    const descriptionParagraph = page.locator('p').filter({ hasText: NEW_DESCRIPTION })
    await expect(descriptionParagraph).toBeVisible({ timeout: 5000 })
    console.log(`✅ Описание отображается в каталоге: "${NEW_DESCRIPTION}"`)

    // Финальная проверка — текст точно совпадает
    await expect(descriptionParagraph).toHaveText(NEW_DESCRIPTION)
    console.log(`✅ Текст описания точно совпадает`)
  })
})
