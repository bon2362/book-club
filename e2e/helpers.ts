import { expect, type Page } from '@playwright/test'

/**
 * Сохранение профиля идёт через POST /api/signup — он пишет пользователя,
 * список книг, аудит и активность, а тестовая БД (ветка Neon) удалённая,
 * поэтому каждый запрос внутри идёт по сети. Локально ответ занимает 4-6 секунд,
 * то есть ровно на границе дефолтных 5 секунд Playwright: тесты падали не из-за
 * продукта, а из-за того, что ждали строго дефолт.
 *
 * Дожидаться закрытия формы обязательно: пока она открыта, её оверлей
 * перехватывает клики по карточкам книг (см. docs/features/testing.md).
 */
export const PROFILE_SAVE_TIMEOUT = 30_000

export async function saveProfile(page: Page, name: string, contact: string): Promise<void> {
  await expect(page.getByLabel(/имя/i)).toBeVisible()
  await page.getByLabel(/имя/i).fill(name)
  await page.getByLabel(/telegram/i).fill(contact)
  await page.getByRole('button', { name: /сохранить/i }).click()
  await expect(page.getByLabel(/имя/i)).not.toBeVisible({ timeout: PROFILE_SAVE_TIMEOUT })
}
