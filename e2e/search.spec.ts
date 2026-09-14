import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

// Один сценарий вместо трёх. Прежний тест фильтрации проходил при любом исходе
// (ветка по «Ничего не найдено» и сравнение «не больше, чем было»), а подсчёт
// карточек шёл без ожидания. Правила совпадений покрывает lib/search.test.ts;
// здесь проверяется связка поля ввода, фильтра каталога и пустого состояния.
//
// Поиск нечёткий (Fuse, threshold 0.4), поэтому тест не требует «ровно одну
// карточку» — её могли бы дать остатки упавших прогонов с похожим названием.
// Вместо этого рядом создаётся контрольная книга, которая обязана скрыться.
test.describe('поиск по книгам', () => {
  test.beforeEach(async () => {
    await epic('Каталог книг')
    await feature('Поиск')
  })

  test('находит книгу по названию, очистка возвращает каталог, пустой результат показывает «Ничего не найдено»', async ({
    page,
    createTestBook,
  }) => {
    const suffix = Math.random().toString(36).slice(2, 8)
    const target = await createTestBook({ title: `Маркер поиска ${suffix}`, author: 'Автор Поиска' })
    const control = await createTestBook({ title: `Zyxwv контроль ${suffix}`, author: 'Qwerty Control' })

    await page.goto('/')
    const cards = page.locator('article')
    await expect(cards.filter({ hasText: target.title })).toHaveCount(1)
    await expect(cards.filter({ hasText: control.title })).toHaveCount(1)
    const total = await cards.count()

    const search = page.getByPlaceholder('Поиск по названию или автору…')
    await search.fill(target.title)
    await expect(cards.filter({ hasText: target.title })).toHaveCount(1)
    await expect(cards.filter({ hasText: control.title })).toHaveCount(0)

    await search.fill('')
    await expect(cards).toHaveCount(total)

    await search.fill('абвгдеж_нет_такой_книги_ёёё')
    await expect(page.getByText('Ничего не найдено')).toBeVisible()
    await expect(cards).toHaveCount(0)
  })
})
