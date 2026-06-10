import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

// Dedicated emails so afterEach cleanup is predictable
const ADMIN_EMAIL = 'e2e-auditlog-admin@test.invalid'
const ADMIN_NAME  = 'E2E Audit Log Admin'

test.describe('Журнал аудита', () => {
  test.setTimeout(120_000)

  test.beforeEach(async () => {
    await epic('Администрирование')
    await feature('Журнал аудита')
  })

  test.afterEach(async ({ page }) => {
    await page.request.delete('/api/test/session', { data: { email: ADMIN_EMAIL } })
  })

  // -------------------------------------------------------------------------
  // TEST 1 — мутация книги (через withAuditContext) попадает в журнал и
  // переживает перезагрузку страницы
  // -------------------------------------------------------------------------
  test('мутация книги через обёрнутый роут отображается в журнале после reload', async ({
    page,
    createTestBook,
  }) => {
    // 1. Логинимся как админ
    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })

    // 2. Создаём тестовую книгу (фикстура удалит её в teardown)
    const book = await createTestBook({ visibility: 'draft' })

    // 3. Мутируем через обёрнутый PATCH-роут (source='admin')
    const patchRes = await page.request.patch(
      `/api/admin/books/${encodeURIComponent(book.id)}`,
      { data: { visibility: 'published' } },
    )
    expect(patchRes.ok(), `PATCH должен вернуть 2xx, получили ${patchRes.status()}`).toBe(true)

    // 4. Открываем вкладку аудит-лога
    await page.goto('/admin?tab=audit')
    await page.waitForLoadState('networkidle')

    // Убеждаемся, что вкладка активна (на случай если query-param не переключил)
    const auditTab = page.getByTestId('admin-tab-audit')
    await expect(auditTab).toBeVisible()
    // Кликаем явно, чтобы гарантировать загрузку компонента AdminAuditLog
    await auditTab.click()
    await page.waitForLoadState('networkidle')

    // 5. Ищем строку с нашим book.id
    const matchingRow = page
      .locator('[data-testid="audit-row"]')
      .filter({ hasText: book.id })
      .first()

    await expect(matchingRow).toBeVisible({ timeout: 15_000 })

    // Ячейка «Кто» (2-я td) НЕ должна содержать «внесистемное»
    const whoCell = matchingRow.locator('td').nth(1)
    await expect(whoCell).not.toContainText('внесистемное')

    // 6. Проверка персистентности — reload и снова ищем запись
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.getByTestId('admin-tab-audit').click()
    await page.waitForLoadState('networkidle')

    const rowAfterReload = page
      .locator('[data-testid="audit-row"]')
      .filter({ hasText: book.id })
      .first()

    await expect(rowAfterReload).toBeVisible({ timeout: 15_000 })
    const whoCellAfterReload = rowAfterReload.locator('td').nth(1)
    await expect(whoCellAfterReload).not.toContainText('внесистемное')
  })

  // -------------------------------------------------------------------------
  // TEST 2 — вставка в обход кода (сырой SQL) помечается «внесистемным»
  // -------------------------------------------------------------------------
  test('вставка вне withAuditContext помечается «внесистемным» в журнале', async ({
    page,
    dbExec,
  }) => {
    // 1. Логинимся как админ (нужен для открытия /admin)
    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })

    // 2. Уникальный тег-зонд — не коллизируется с другими прогонами
    const probeTag = `__e2e_oob_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

    // Cleanup регистрируем до INSERT, чтобы он выполнился даже при падении теста
    dbExec.registerCleanup(
      `DELETE FROM "tag_descriptions" WHERE tag = $1`,
      [probeTag],
    )

    // 3. Вставляем строку напрямую — без withAuditContext,
    //    поэтому триггер не найдёт app.audit_source и выставит source='trigger'
    await dbExec(
      `INSERT INTO "tag_descriptions" (tag, description) VALUES ($1, $2)`,
      [probeTag, 'e2e out-of-band probe'],
    )

    // 4. Открываем журнал аудита
    await page.goto('/admin?tab=audit')
    await page.waitForLoadState('networkidle')

    const auditTab = page.getByTestId('admin-tab-audit')
    await expect(auditTab).toBeVisible()
    await auditTab.click()
    await page.waitForLoadState('networkidle')

    // 5. Ищем строку, содержащую наш тег-зонд в колонке ID (entityId)
    //    Компонент рендерит entityId в последнем td (6-я колонка)
    const matchingRow = page
      .locator('[data-testid="audit-row"]')
      .filter({ hasText: probeTag })
      .first()

    await expect(matchingRow).toBeVisible({ timeout: 15_000 })

    // 6. Ячейка «Кто» (2-я td) должна содержать «внесистемное»
    const whoCell = matchingRow.locator('td').nth(1)
    await expect(whoCell).toContainText('внесистемное')
  })
})
