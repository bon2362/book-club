# UI Layout Testing: разбор багов и системное решение

**Дата:** 2026-03-19
**Контекст:** Реализация #69 (умная шапка). Два бага прошли через весь пайплайн (spec → implementation → two-stage review → CI) и были обнаружены только при ручной проверке в браузере.

---

## Баги и анализ «Пять почему»

### Баг 1: Пустая шапка при скролле вниз

**Симптом:** При скролле вниз шапка исчезала, но оставалась белая полоса с чёрной нижней рамкой.

**Пять почему:**

1. Почему шапка была пустой?
   `transform` применили к inner wrapper div, а не к `<header>`. `<header>` сохранял свой `background: #fff` и `borderBottom: 2px solid #000`.

2. Почему применили к wrapper?
   Рецензент спека предупредил: «transform на sticky-элементе ломает стикинесс» — и предложил inner wrapper как обходное решение.

3. Почему этот совет приняли без проверки?
   Замечание звучало технически обоснованно. Не было теста, который бы опроверг или подтвердил гипотезу эмпирически. Рецензент прав насчёт проблемы, но ошибся с решением: inner wrapper прячет контент, но не сам элемент.

4. Почему рецензент предложил неверное решение?
   Рецензент проверял соответствие коду спека, а не реальное визуальное поведение в браузере. Теоретический CSS-анализ не выявляет разницу между «контент скрыт» и «элемент скрыт».

5. Почему не было инструмента, который поймал бы это?
   Наши тесты проверяют логику (unit) и user flows (e2e), но не CSS-рендеринг. Нет ни visual regression, ни проверки bounding box.

**Правильное решение:** `transform: translateY(-100%)` напрямую на `<header>` — элемент целиком уходит за экран. В современных браузерах (Chrome/Firefox/Safari) transform на sticky-элементе не ломает стикинесс когда transform=0; а когда translateY(-100%) — элемент всё равно скрыт, стикинесс не важен.

---

### Баг 2: Фильтры остаются видны при скролле вниз

**Симптом:** При скролле вниз фильтры не исчезали, а перемещались к верхнему краю экрана (вторая строка фильтров оставалась видна).

**Пять почему:**

1. Почему фильтры не скрылись?
   Формула `translateY(-100%)` двигала элемент вверх на его собственную высоту (~90px). Но стартовая sticky-позиция — `top: 57px`. Итог: `57 - 90 = -33px` — верхний край за экраном, нижний `(-33 + 90) = 57px` — всё ещё виден.

2. Почему формула была неверной?
   Расчёт был качественным («двигаем на собственную высоту»), а не математически строгим. Никто не посчитал: `final_bottom = sticky_top - translate + height` и не проверил знак.

3. Почему не считали строго?
   Формула была в спеке, спек прошёл ревью, субагент воспроизвёл её. Ни на одном этапе не было теста, который бы проверил `getBoundingClientRect().bottom` после скролла.

4. Почему спек содержал неверную формулу?
   Я сформулировал её интуитивно, рецензент спека проверял структуру (sticky, zIndex, overflow), но не доказал корректность числового значения.

5. Почему ошибка прошла через три ревью?
   Все три ревью (spec, spec-compliance, code-quality) были текстовыми. Они проверяли «соответствие коду спека», а не «соответствие поведения ожидаемому». Цепочка точно воспроизвела ошибку спека.

**Математика правильного решения:**
```
Цель: нижний край фильтра ≤ 0 (полностью за экраном)
Нижний край = sticky_top + height + translateY
0 ≥ sticky_top + height + translateY
translateY ≤ -(sticky_top + height)
translateY = -(height + sticky_top) = translateY(calc(-100% - var(--header-height)))
```

Правильная формула: `translateY(calc(-100% - var(--header-height, 57px)))`

---

## Корневая причина обоих багов

Весь пайплайн (unit-тесты, spec-review, code-quality review) работает со **статическими артефактами** — читает код, сравнивает с текстом. Ни один этап не спрашивает браузер: «что реально происходит с элементом в состоянии X?»

Это означает целый класс багов — CSS-поведения: скрытие, позиционирование, анимации, overflow — **невидим для всего автоматического пайплайна**.

---

## Системное решение: UI Layout Assertions

### Концепция

Не скриншоты (platform-dependent, binary в git, ломаются при любом изменении UI).
А **геометрические проверки**: дан UI-стейт → проверяем `boundingBox()` элементов.

- **Инструмент:** Playwright (уже установлен)
- **Файл:** `e2e/ui-states.spec.ts`
- **Паттерн:** `isFullyAboveViewport` / `isFullyVisible` хелперы + проверки после изменения стейта

### Реализация `e2e/ui-states.spec.ts`

```ts
import { test, expect } from '@playwright/test'

async function isFullyAboveViewport(page, selector: string) {
  const box = await page.locator(selector).boundingBox()
  if (!box) return true
  return box.y + box.height <= 0
}

async function isFullyVisible(page, selector: string) {
  const box = await page.locator(selector).boundingBox()
  if (!box) return false
  return box.y >= 0 && box.y < page.viewportSize()!.height
}

test.describe('Header: hide on scroll down', () => {
  test('header visible at top of page', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    expect(await isFullyVisible(page, 'header')).toBe(true)
  })

  test('header hides after scrolling down past threshold', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }))
    await page.waitForTimeout(350)
    expect(await isFullyAboveViewport(page, 'header')).toBe(true)
  })

  test('filter bar hides together with header on scroll down', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }))
    await page.waitForTimeout(350)
    const filterBox = await page.locator('.filters-bar').boundingBox()
    expect(filterBox!.y + filterBox!.height).toBeLessThanOrEqual(0)
  })

  test('header and filters reappear on scroll up', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }))
    await page.waitForTimeout(350)
    await page.evaluate(() => window.scrollTo({ top: 100, behavior: 'instant' }))
    await page.waitForTimeout(350)
    expect(await isFullyVisible(page, 'header')).toBe(true)
  })
})
```

### Изменения в CLAUDE.md

Добавить в раздел «Unit-тесты» новый раздел:

```markdown
## UI Layout Tests (Playwright)

Для задач, затрагивающих CSS-поведение (скрытие, позиционирование, анимации):
- Добавить тест в `e2e/ui-states.spec.ts` с проверкой `boundingBox()` элемента в нужном стейте
- Субагент не может коммитить UI-задачу без этого теста
- Запуск: `npm run playwright test e2e/ui-states.spec.ts`

**Субагенты перед коммитом UI-задач обязаны запускать:**
`npm run lint && npm run typecheck && npm test && npm run playwright test e2e/ui-states.spec.ts`

**Математическое доказательство CSS-формул:**
Для transform/position расчётов — писать комментарий с выводом формулы, как в геометрии:
final_pos = start_pos + transform → проверить знак, что результат за границей экрана.
```

### Изменения в шаблоне планов (writing-plans)

Для UI-задач добавить обязательный шаг после имплементации:

```markdown
- [ ] Написать layout assertion тест в e2e/ui-states.spec.ts
      (проверяет bounding box элемента в нужном стейте)
- [ ] Убедиться что тест ПАДАЕТ до изменений (TDD)
- [ ] Убедиться что тест ПРОХОДИТ после изменений
- [ ] Запустить: npm run playwright test e2e/ui-states.spec.ts
```

---

## Что нужно сделать в следующей сессии

**Задача в бэклоге:** #75 (см. BACKLOG.md)

1. Создать `e2e/ui-states.spec.ts` с хелперами и тестами для шапки (#69)
2. Убедиться что тесты проходят в CI (запустить через GitHub Actions)
3. Обновить `CLAUDE.md` — добавить раздел UI Layout Tests
4. Обновить `docs/superpowers/plans/` — добавить шаг в шаблон для UI-задач
5. Опционально: добавить CSS-комментарий с математикой в BooksPage.tsx

**Ориентир по сложности:** S (полдня). Большая часть — написание тестов и обновление инструкций.
