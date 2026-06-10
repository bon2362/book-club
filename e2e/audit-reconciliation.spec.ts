import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

const ADMIN_EMAIL = 'e2e-auditrecon-admin@test.invalid'
const ADMIN_NAME = 'E2E Audit Recon Admin'

// Reconciliation: проверяем, что мутация через обёрнутый роут получает реального
// actor (source != 'trigger'). Если бы роут забыли обернуть в withAuditContext,
// триггер выставил бы source='trigger' — и этот тест бы упал, сигнализируя дрейф.
test.describe('Reconciliation аудита', () => {
  test.setTimeout(120_000)

  test.beforeEach(async () => {
    await epic('Администрирование')
    await feature('Журнал аудита')
  })

  test.afterEach(async ({ page }) => {
    await page.request.delete('/api/test/session', { data: { email: ADMIN_EMAIL } })
  })

  test('обёрнутая мутация пишет реального actor, а не source=trigger', async ({
    page,
    createTestBook,
    dbExec,
  }) => {
    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })

    const book = await createTestBook({ visibility: 'draft' })
    // audit_log append-only и не чистится фикстурой книги — убираем записи зонда сами
    dbExec.registerCleanup(`DELETE FROM "audit_log" WHERE entity_id = $1`, [book.id])

    const patchRes = await page.request.patch(
      `/api/admin/books/${encodeURIComponent(book.id)}`,
      { data: { visibility: 'published' } },
    )
    expect(patchRes.ok(), `PATCH должен вернуть 2xx, получили ${patchRes.status()}`).toBe(true)

    const rows = await dbExec(
      `SELECT source, actor_user_id FROM "audit_log"
       WHERE entity_id = $1 AND action = 'update'
       ORDER BY occurred_at DESC LIMIT 1`,
      [book.id],
    )

    expect(rows.length).toBe(1)
    expect(rows[0].source).toBe('admin')
    expect(rows[0].source).not.toBe('trigger')
    expect(rows[0].actor_user_id).toBeTruthy()
  })
})
