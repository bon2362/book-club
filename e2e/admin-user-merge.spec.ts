import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

test.describe('Admin: слияние дублей пользователей', () => {
  test.setTimeout(90_000)

  test.beforeEach(async () => {
    await epic('Admin')
    await feature('Слияние пользователей')
  })

  test('админ сливает source в target, после reload source исчезает, target сохраняет запись', async ({ page, dbExec, loginAsAdmin, createTestBook }, testInfo) => {
    const seed = testInfo.testId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 10)
    const sourceId = `__e2e_merge_source_${seed}__`
    const targetId = `__e2e_merge_target_${seed}__`
    const sourceEmail = `${sourceId}@test.invalid`
    const targetEmail = `${targetId}@test.invalid`
    const sourceName = `E2E Merge Source ${seed}`
    const targetName = `E2E Merge Target ${seed}`
    const book = await createTestBook({ title: `E2E Merge Book ${seed}` })

    dbExec.registerCleanup('DELETE FROM "user" WHERE id = ANY($1::text[])', [[sourceId, targetId]])
    dbExec.registerCleanup('DELETE FROM user_merge_events WHERE source_user_id = $1 OR target_user_id = $2', [sourceId, targetId])

    await dbExec(
      `INSERT INTO "user" (id, name, contact_email, contacts, created_at)
       VALUES ($1, $2, $3, $4, now()), ($5, $6, $7, $8, now())`,
      [sourceId, sourceName, sourceEmail, '@merge_source', targetId, targetName, targetEmail, '@merge_target'],
    )
    await dbExec(
      `INSERT INTO user_identities (id, user_id, provider, provider_account_id, email, created_at, last_seen_at)
       VALUES ($1, $2, 'google', $3, $4, now(), now()), ($5, $6, 'telegram', $7, null, now(), now())`,
      [`${sourceId}_identity`, sourceId, sourceEmail, sourceEmail, `${targetId}_identity`, targetId, targetId],
    )
    await dbExec(
      `INSERT INTO signup_books (user_id, book_id, signed_at, personal_status)
       VALUES ($1, $2, now(), null)`,
      [sourceId, book.id],
    )

    await loginAsAdmin({ email: `admin-${seed}@test.invalid`, name: `E2E Merge Admin ${seed}` })
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    await page.getByLabel('Поиск пользователей').fill(targetName)
    await page.locator('tr').filter({ hasText: targetName }).click()
    const targetDrawer = page.getByRole('dialog')
    await expect(targetDrawer).toBeVisible()
    await expect(targetDrawer.getByRole('button', { name: new RegExp(`скопировать id пользователя ${targetId}`, 'i') })).toBeVisible()
    await page.getByRole('button', { name: 'Закрыть' }).click()

    await page.getByLabel('Поиск пользователей').fill(sourceName)
    await page.locator('tr').filter({ hasText: sourceName }).click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()

    await drawer.getByLabel('ID аккаунта, который оставить').fill(targetId)
    await expect(drawer.getByText(targetName)).toBeVisible()
    await expect(drawer.getByText(targetId)).toBeVisible()
    page.once('dialog', dialog => dialog.accept())
    const mergeDone = page.waitForResponse(response =>
      response.url().includes('/api/admin/users/merge') && response.request().method() === 'POST',
    )
    await drawer.getByRole('button', { name: 'Merge to user' }).click()
    await mergeDone

    await expect(page.getByText('Пользователи слиты')).toBeVisible()
    await page.reload()
    await page.waitForLoadState('networkidle')

    await page.getByLabel('Поиск пользователей').fill(sourceName)
    await expect(page.locator('tr').filter({ hasText: sourceName })).toHaveCount(0)

    await page.getByLabel('Поиск пользователей').fill(targetName)
    const targetRow = page.locator('tr').filter({ hasText: targetName })
    await expect(targetRow).toBeVisible()
    await expect(targetRow.locator('td').first()).toContainText('1')
  })
})
