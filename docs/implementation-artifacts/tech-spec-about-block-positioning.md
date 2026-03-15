---
title: 'About Block — трёхуровневый компонент позиционирования'
type: 'feature'
created: '2026-03-15'
status: 'done'
baseline_commit: '9143201eb1376057f849384dcadcae6a6dad1410'
context: ['docs/project-context.md']
---

# About Block — трёхуровневый компонент позиционирования

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Текущий однострочный About-банер не даёт новому посетителю достаточно контекста — клуб устроен нетривиально (3–4 человека, камеры, демократия), и один баннер это не передаёт. Человек уходит без действия не потому что клуб не подходит, а потому что не понял что это.

**Approach:** Заменить текущий About-баннер на трёхуровневый компонент «Редакционный» (Вариант C из дизайн-прототипа): L1 — всегда виден, L2 — аккордеон с 5 Q&A-секциями. Добавить «Что это?» в шапку как точку восстановления.

## Boundaries & Constraints

**Always:**
- Вариант C визуального дизайна: `border-left: 3px solid`, eyebrow «О клубе», нумерованные вопросы, Playfair Display для заголовков секций
- Inline styles — как во всех компонентах `nd/`
- Состояние скрытия — `localStorage` ключ `aboutDismissed` (не cookie)
- Весь L1-блок кликабелен для раскрытия аккордеона (если закрыт); если аккордеон уже открыт — клик по L1 ничего не делает
- Одновременно открыта максимум одна Q&A-секция
- `aria-expanded` на каждой кнопке-заголовке аккордеона; все интерактивные элементы — `<button>`
- Touch targets секций ≥ 44px высотой
- Кнопки «Подробнее» и «×» вызывают `event.stopPropagation()` чтобы не баблиться до L1-блока

**Ask First:**
- Если понадобится менять шрифт Playfair Display (сейчас подключён глобально в layout)
- Если потребуется анимация высоты (не только display) — может быть запрошено позже

**Never:**
- Отдельная страница `/about`
- Внешние компонентные библиотеки или анимационные библиотеки
- Хранить состояние открытой секции в localStorage (только `aboutDismissed`)
- Удалять существующую cookie `about_closed` активно — она просто игнорируется и умрёт сама

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Первый визит | `aboutDismissed` отсутствует в localStorage | L1-блок виден, аккордеон закрыт | — |
| Повторный визит после «×» | `aboutDismissed = "true"` | L1-блок скрыт | — |
| Клик «Что это?» при скрытом блоке | `aboutDismissed = "true"` | Удалить ключ, показать блок, раскрыть аккордеон, scrollIntoView | — |
| Клик «Что это?» при видимом блоке | блок виден | scrollIntoView к блоку (без повторного открытия) | — |
| Клик «×» | блок виден | Скрыть, записать `aboutDismissed = "true"` в localStorage | — |
| Клик на L1 (аккордеон закрыт) | блок виден, аккордеон закрыт | Раскрыть аккордеон | — |
| Клик на L1 (аккордеон открыт) | аккордеон открыт | Ничего (клик внутри аккордеона не баблится) | — |
| Клик на заголовок-вопрос (закрыт) | секция X закрыта | Открыть X, закрыть все остальные | — |
| Клик на заголовок-вопрос (открыт) | секция X открыта | Закрыть X | — |

</frozen-after-approval>

## Code Map

- `components/nd/AboutBlock.tsx` — НОВЫЙ: `AboutBlock` (L1 + аккордеон) + `AccordionSection` (subcomponent)
- `components/nd/BooksPage.tsx` — ИЗМЕНИТЬ: заменить About-баннер на `<AboutBlock>`, убрать cookie-логику, добавить `onWhatIsThis` ref/callback к Header
- `components/nd/Header.tsx` — ИЗМЕНИТЬ: добавить проп `onWhatIsThis?: () => void`, рендерить «Что это?» как кнопку-ссылку в nav

## Tasks & Acceptance

**Execution:**
- [ ] `components/nd/AboutBlock.tsx` -- СОЗДАТЬ компонент с L1-блоком и AccordionSection. Props: `onClose: () => void`. Рефа на DOM-элемент блока для scrollIntoView — через `forwardRef` или `useRef` + callback. localStorage читается в `useEffect`. Текст L1 и 5 Q&A — из HTML-прототипа Варианта C (см. Design Notes).
- [ ] `components/nd/BooksPage.tsx` -- ЗАМЕНИТЬ About-баннер: удалить `showAbout`/`handleCloseAbout` с cookie, добавить state `aboutVisible` (читается из localStorage), рефа на блок About, `handleWhatIsThis` функцию (удаляет `aboutDismissed`, показывает блок, раскрывает аккордеон, scrollIntoView). Передать `onWhatIsThis={handleWhatIsThis}` в `<Header>`.
- [ ] `components/nd/Header.tsx` -- ДОБАВИТЬ проп `onWhatIsThis?: () => void`. Рендерить `<button>Что это?</button>` в nav-секции (левая часть, рядом с «Книжный клуб»). Стиль: Inter, 0.8rem, #555, без border, cursor pointer.
- [ ] `components/nd/AboutBlock.test.tsx` -- СОЗДАТЬ unit-тесты: localStorage-инициализация (блок скрыт при `aboutDismissed=true`), раскрытие аккордеона по клику на L1, toggle секций (открывается одна — предыдущая закрывается), клик «×» пишет `aboutDismissed` в localStorage

**Acceptance Criteria:**
- Given новый посетитель, when открывает главную, then видит L1-блок с текстом и eyebrow «О клубе»
- Given посетитель видит L1, when кликает на блок (не на кнопки), then аккордеон раскрывается
- Given аккордеон раскрыт, when кликает на заголовок секции, then секция открывается; предыдущая открытая — закрывается
- Given блок виден, when кликает «×», then блок исчезает; при перезагрузке страницы — блок скрыт
- Given блок скрыт, when кликает «Что это?» в шапке, then блок появляется с открытым аккордеоном
- Given блок уже виден, when кликает «Что это?» в шапке, then страница скроллится к блоку
- Given `localStorage` содержит старый cookie `about_closed`, then не влияет на поведение (игнорируется)

## Design Notes

**Текст L1:** «Собираю небольшие читательские группы — по **3–4 человека**, раз в неделю по видеосвязи, о книгах по демократии. Выбирайте, что хотите прочитать — я найду вам компанию.»

**5 Q&A секций** (текст из HTML-прототипа Варианта C):
1. «Что это такое?» — 2 абзаца: о читательских кругах + о сборе группы в Telegram
2. «Как это устроено?» — 2 абзаца: отмечаете книги → группа из 3–4 → общий чат + видеосвязь раз в неделю
3. «Для кого это?» — 1 абзац: совместное чтение + готовность к видеосвязи с камерой
4. «Почему именно демократия?» — 1 абзац: «Мы не можем дать определение демократии — поэтому и читаем»
5. «Чем это не является?» — 1 абзац: не дискуссионный клуб + информационный пузырь (осознанно)

**Цветовая схема Варианта C:**
```
border-left: 3px solid #ccc  →  hover: #999  →  expanded: #888
background: #fff  →  hover/expanded: #fafafa
eyebrow: 0.65rem, uppercase, #bbb, letterSpacing 0.1em
L1-text: Inter, 0.875rem, #555, lineHeight 1.65
question: Playfair Display, 0.95rem, #444 (active: #111)
number: Playfair Display, 0.7rem, #ccc
answer: Inter, 0.83rem, #555, lineHeight 1.7
arrow: ▼ 0.65rem, #ccc → rotate(180deg) when open
transition: 150ms on border-left-color, background, color, transform
```

**Responsive:** при `max-width: 480px` — L1-row переходит в column (текст над кнопками).

## Verification

**Commands:**
- `npm run build` -- expected: no TypeScript errors, build completes successfully

**Manual checks:**
- В браузере: L1-блок виден при первом открытии, аккордеон работает, «×» скрывает блок, localStorage содержит `aboutDismissed`
- «Что это?» в шапке: появляется, кликает → блок показывается
- Mobile (или DevTools 375px): L1-row стакается в колонку
