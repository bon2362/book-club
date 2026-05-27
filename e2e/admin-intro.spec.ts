import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

const USER_EMAIL = 'e2e-intro-user@test.invalid'

test.describe('AdminPanel — вкладка «Интро»', () => {
  test.setTimeout(120_000)

  test.beforeEach(async () => {
    await epic('Администрирование')
    await feature('Редактирование интро')
  })

  test('админ редактирует свою секцию — изменение сохраняется после reload и видно на главной', async ({
    page,
    loginAsAdmin,
    createIntroSection,
  }) => {
    await loginAsAdmin()

    // Фикстурная секция — гарантированно удалится в teardown,
    // не трогает существующие записи интро.
    const initialQuestion = `E2E intro ${test.info().testId}`
    const section = await createIntroSection({
      title: initialQuestion,
      body: 'E2E ответ',
      isPublished: true,
    })

    await page.goto('/admin?tab=intro')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('intro-editor')).toBeVisible()

    const questionInput = page.getByTestId(`intro-question-${section.id}`)
    await expect(questionInput).toBeVisible()
    await expect(questionInput).toHaveValue(initialQuestion)

    // Редактируем заголовок именно нашей секции
    const editedQuestion = `${initialQuestion} (edited)`
    await questionInput.fill(editedQuestion)
    await page.getByTestId('intro-save').click()
    await expect(page.getByTestId('intro-msg')).toHaveText('Сохранено')

    // Reload — изменение сохранилось в БД
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId(`intro-question-${section.id}`)).toHaveValue(editedQuestion)

    // На главной новый текст виден в аккордеоне
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.getByText('Подробнее ↓').click()
    await expect(page.getByText(editedQuestion)).toBeVisible()
  })

  test('[SEC] обычный пользователь не может редактировать интро', async ({ page }) => {
    await page.request.post('/api/test/session', {
      data: { email: USER_EMAIL, name: 'Plain User' },
    })

    try {
      const getRes = await page.request.get('/api/admin/intro')
      expect(getRes.status()).toBe(403)

      const putRes = await page.request.put('/api/admin/intro', {
        data: { patches: [{ id: 'fake', title: 'hax' }] },
      })
      expect(putRes.status()).toBe(403)

      const postRes = await page.request.post('/api/admin/intro')
      expect(postRes.status()).toBe(403)
    } finally {
      await page.request.delete('/api/test/session', { data: { email: USER_EMAIL } })
    }
  })
})
