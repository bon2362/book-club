import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

test.describe('Реакция «Полезно» для саммари', () => {
  test.beforeEach(async () => {
    await epic('Каталог книг')
    await feature('Полезность саммари')
  })

  test('гость добавляет и снимает реакцию с сохранением после перезагрузки', async ({
    page,
    createPublishedSummary,
    dbExec,
  }) => {
    const summary = await createPublishedSummary()
    await page.goto(summary.url)
    await page.waitForLoadState('networkidle')

    const helpful = page.getByTestId('summary-helpful-button')
    await expect(helpful).toHaveText('Полезно')
    await expect(helpful).not.toContainText('· 0')

    const putResponse = page.waitForResponse(response => (
      response.url().includes(`/api/summaries/${summary.id}/helpful`) && response.request().method() === 'PUT'
    ))
    await helpful.click()
    await expect(helpful).toHaveAttribute('aria-pressed', 'true')
    await expect(helpful).toHaveText('Полезно · 1')
    expect((await putResponse).ok()).toBe(true)

    const cookie = (await page.context().cookies()).find(item => item.name === '__Secure-summary-helpful')
    expect(cookie).toBeDefined()
    expect(cookie!.httpOnly).toBe(true)
    expect(cookie!.secure).toBe(true)
    expect(cookie!.sameSite).toBe('Lax')
    expect(cookie!.path).toBe('/api/summaries')

    const [audit] = await dbExec(
      `select source,
              coalesce(before ? 'visitor_hash', false) as before_has_hash,
              coalesce(after ? 'visitor_hash', false) as after_has_hash
         from audit_log
        where entity_type = 'book_summary_helpful_reactions'
          and entity_id in (
            select id from book_summary_helpful_reactions where summary_id = $1
          )
        order by occurred_at desc
        limit 1`,
      [summary.id],
    )
    expect(audit).toMatchObject({
      source: 'summary-helpful',
      before_has_hash: false,
      after_has_hash: false,
    })

    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(helpful).toHaveAttribute('aria-pressed', 'true')
    await expect(helpful).toHaveText('Полезно · 1')

    const deleteResponse = page.waitForResponse(response => (
      response.url().includes(`/api/summaries/${summary.id}/helpful`) && response.request().method() === 'DELETE'
    ))
    await helpful.click()
    await expect(helpful).toHaveAttribute('aria-pressed', 'false')
    expect((await deleteResponse).ok()).toBe(true)
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(helpful).toHaveText('Полезно')
    await expect(helpful).not.toContainText('· 0')
  })
})
