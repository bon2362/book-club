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

/**
 * Страница гидрирована: `AppProviders` ставит `data-hydrated` на `<html>` через кадр
 * после монтирования. Заменяет `waitForLoadState('networkidle')`: тишина в сети не
 * гарантирует гидратацию, а на страницах с опросом сервера или внешними картинками
 * наступает поздно или никогда. Таймаут с запасом на ленивую компиляцию dev-сервера.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await expect(page.locator('html[data-hydrated="true"]')).toHaveCount(1, { timeout: 30_000 })
}

export async function saveProfile(page: Page, name: string, contact: string): Promise<void> {
  await expect(page.getByLabel(/имя/i)).toBeVisible()
  await page.getByLabel(/имя/i).fill(name)
  await page.getByLabel(/telegram/i).fill(contact)
  await page.getByRole('button', { name: /сохранить/i }).click()
  await expect(page.getByLabel(/имя/i)).not.toBeVisible({ timeout: PROFILE_SAVE_TIMEOUT })
}
