# Handoff: Matching — режим «удовлетворённость» (satisfaction mode)

## Overview
Новый **режим расчёта** matching-сессии, дополняющий существующий. Сейчас сценарии
ранжируются «покрытие-первым»; satisfaction переворачивает приоритет — **сначала качество
совпадений интересов, покрытие вторично**. Режим выбирается **при создании сессии** и
фиксируется на всю сессию. Дефолт — `coverage` (текущее поведение не меняется).

Этот бандл документирует **четыре UI-поверхности**, которые задаёт дизайн:
1. Селектор режима в форме создания сессии (админка).
2. Промежуточный экран ранжирования `MatchingRankingGate` (участник).
3. Нейтральный копирайт списка сценариев в satisfaction.
4. Смягчённый adrift-баннер «вы за бортом».

> **Полная спецификация фичи** (движок, схема БД, API, ходы, тесты, порядок реализации) —
> в `2026-06-05-matching-satisfaction-mode-design.md` (в корне бандла). Этот README покрывает
> **UI/дизайн**; за логикой расчёта, миграцией и проводкой `mode` обращайтесь к спеке (§1–§5, §7–§9).

## About the Design Files
Файлы `Satisfaction Mode — дизайн.html` + `satisfaction-mode/*.jsx` — это **дизайн-референс,
собранный в HTML/React** (прототип внешнего вида и поведения), **не продакшн-код для копирования**.
Задача — **воспроизвести эти поверхности в существующем codebase** (`book-club`, Next.js + React,
client-компоненты в `components/nd/`), используя его установленные паттерны: токены `var(--…)` из
`app/globals.css`, dnd-kit для drag, существующие примитивы (`CoverImage`, `ParticipantInterestChip`,
`MatchingPersonalList`).

Мокапные данные (книги, псевдонимы, обложки) — выдуманные для наглядности; обложки в мокапе
нарисованы CSS-плейсхолдером, в проде грузятся по `coverUrl` через `CoverImage`.

## Fidelity
**High-fidelity.** Цвета, типографика, отступы и копирайт — финальные и взяты из реальной
дизайн-системы проекта. Воспроизводить попиксельно средствами codebase. Все значения — через
существующие токены `var(--…)`, **без сырых хексов** (правило проекта).

---

## Screens / Views

### 1. Селектор режима в форме создания сессии
**Файл-цель:** `components/nd/AdminMatchingSession.tsx` (форма `handleCreate`).
**API:** `app/api/matching/sessions/route.ts` (POST) принимает/валидирует/пишет `optimizationMode`.

**Регистр:** моноширинная админка — `font-family: var(--nd-mono)`, острые углы (`--radius: 0`),
хайрлайн-границы, инпуты с нижней границей `1px solid var(--border)`.

**Layout:** новое поле «Режим подбора» вставляется в существующую `<form>` (column, `gap: 0.85rem`,
`maxWidth: 400`) **между** полем «Дедлайн» и кнопкой «Создать сессию».

**Компонент поля:**
- Label: `Режим подбора` — `display:block; font-size:0.72rem; color:var(--text-secondary); margin-bottom:2px` (как у остальных полей формы).
- Контейнер `role="radiogroup"`: `border:1px solid var(--border)`, `border-bottom:2px solid var(--border-strong)` (фирменная сильная линия снизу, как у чипов событий), `border-radius:var(--radius)` (0), `overflow:hidden`.
- Две опции, разделённые `1px var(--border)`.

**Опция (`role="radio"`):**
- Контейнер: `display:flex; gap:0.6rem; padding:0.6rem 0.75rem`. Выбранная — `background:var(--bg)` + `border-left:2px solid <accent>`; невыбранная — `background:var(--bg-input)`, `border-left:2px solid transparent`. Hover: `background:#FBF8F2`.
- Accent опции: `coverage → var(--success)`, `satisfaction → var(--accent)`.
- Индикатор-радио — **квадрат** (острые углы): `13×13px`, `border:1.5px solid <accent|var(--text-muted)>`, внутри при выборе квадрат `6×6px` залит `<accent>`.
- Заголовок: `var(--nd-mono)`, `0.82rem`, `font-weight:600`, `var(--text)`.
- Тег рядом: uppercase `0.56rem`, `letter-spacing:0.13em` — `по умолчанию` (coverage) / `новый` (satisfaction); цвет = accent при выборе, иначе `var(--text-muted)`.
- Описание: `0.72rem`, `line-height:1.45`, `var(--text-secondary)`.
- **Раскрытие satisfaction** (только когда выбран): список из 3 пунктов с маркером `→` (цвет accent), `0.68rem`, `var(--text-muted)`, `gap:0.2rem`.

**Копирайт (точно):**
- Покрытие: «Собрать в группы как можно больше участников. Сценарии ранжируются по охвату — текущее поведение.»
- Удовлетворённость: «Сначала качество совпадений: лучшие круги по интересам, даже если кто-то останется без группы.»
- Раскрытие satisfaction:
  - «Перед доской участник проходит экран ранжирования.»
  - «Без ранга участник не попадает в подбор.»
  - «Зафиксируется при создании, без переключения потом.»

**Поведение:** `coverage` выбран по умолчанию. Значение шлётся в POST как `optimizationMode`.
Поле блокируется (`disabled`), когда уже есть активная сессия (как остальные поля формы).

---

### 2. Промежуточный экран ранжирования `MatchingRankingGate`
**Файл-цель:** новый client-компонент `components/nd/MatchingRankingGate.tsx`.
**Рендер-условие:** в `app/matching/page.tsx` — `mode === 'satisfaction'` **И** не impersonation
**И** статус сессии `active` **И** у зрителя **нет ни одного заранжированного активного signup'а**
(см. спеку §4).

**Регистр:** serif/тёплый (как `MatchingWelcome` / доска). Фон `var(--bg)`, белые карточки.

**Layout (центрированный, `max-width:880px`, `margin:0 auto`):**
- Фоновая базовая сетка `linear-gradient(var(--hair-soft) 1px, transparent 1px)`, `background-size:100% 2.1rem`, `opacity:0.5`, `position:absolute; inset:0; pointer-events:none` (как в `MatchingWelcome`).
- **Интро** (`max-width:620px`):
  - Eyebrow: точка `5×5` `var(--accent)` + текст uppercase `0.6rem` `letter-spacing:0.13em` `var(--text-muted)`: «Режим: удовлетворённость · шаг перед доской».
  - H1: `var(--nd-serif)`, `1.85rem`, `font-weight:700`, `line-height:1.14` — «Сначала расставьте приоритеты».
  - Body: `var(--nd-serif)`, `1.02rem`, `line-height:1.55`, `var(--text-body)`; «сильнее всего» — `<em>` цвета `var(--accent)`.
- **Две колонки** (`grid`, `grid-template-columns:minmax(0,1.18fr) minmax(0,0.82fr)`, `gap:1.1rem`, `margin-top:1.6rem`): **переиспользовать примитивы `MatchingPersonalList`** (`SortableRow`, `CatalogRow`, panel-стили). Левая — «Остальной каталог», правая — «Мои книги» с drag.
- **Футер-CTA** (`position:sticky; bottom:0`, `margin-top:1.4rem`, flex space-between, wrap):
  - Подсказка (текст слева, `0.82rem`): при готовности «Приоритеты сохраняются автоматически. Когда будете готовы — **войдите в подбор**, и доска со сценариями откроется.»; при пустом списке «Добавьте хотя бы одну книгу в список, чтобы кнопка стала активной.»
  - Кнопка «Войти в подбор →»: `padding:0.85rem 1.5rem`, `border-radius:var(--radius-control)`, активна — `background:var(--accent)` / `color:var(--bg-input)`; недоступна — `background:var(--border)` / `color:var(--text-muted)`, `cursor:default`.

**Панель / строки** (из `MatchingPersonalList.tsx`, без изменений):
- panel: `background:var(--bg-input)`, `border-radius:var(--radius-card)`, `box-shadow:var(--shadow-card)`.
- head: `padding:0.85rem 1.25rem 0.6rem`; H3 `var(--nd-serif)` `1rem` `700`; sub `0.74rem` `var(--text-muted)`.
- row: `grid 30px 40px 1fr`, `gap:0.75rem`, `padding:0.6rem 0.75rem`; разделитель `inset 0 1px 0 var(--hair-soft)`.
- «Мои книги» строка: ранг `#N` (`var(--nd-serif)` `700` `0.95rem` `var(--text-secondary)`) + drag-ручка `⠿` (`var(--text-muted)`, `opacity` через `.nd-drag-handle`); co-signups строка «тоже записались: …».
- Обложка через `CoverImage` (40×57, `border-radius:3px`).

**Порог CTA:** активна при **≥1 заранжированной активной книге**.

**Поведение без «прыжков»** (критично, спека §4): компонент **молча коммитит** приоритеты на сервер
(`PATCH /api/matching/priorities`, `POST /api/matching/books`), но **НЕ вызывает `router.refresh()`**
на каждое действие — иначе авто-refresh выбросит человека на доску посреди ранжирования. Переход на
доску — только по явному клику «Войти в подбор». Impersonation (`?as=`) гейт обходит — всегда доска.

---

### 3. Список сценариев в satisfaction (нейтральный копирайт)
**Файлы-цели:** `components/nd/MatchingScenarios.tsx`, `MatchingImpactWorkspace.tsx` — режим
прокидывается пропом (через `overview` или явно).

**Отличия от coverage-варианта** (тот же layout карточек, см. текущий `ScenarioSetCard`):
- **Нет** бейджа «лучший сейчас» и **нет** фона `var(--accent-soft)` у лидера — все карточки равного
  веса (`background:var(--bg-input)`, `box-shadow:0 1px 2px rgba(50,38,24,.04)`). Порядок — только
  однозначный вывод, не вердикт.
- Заголовок карточки: `Сценарий N` (uppercase `0.7rem` `letter-spacing:0.1em` `var(--text-muted)`).
- **Основная метрика — качество круга**: пилюля «средний ранг X.X» (`background:var(--chip-bg)`,
  `color:var(--text-secondary)`, `border-radius:var(--radius-pill)`, `0.7rem` `600`). Охват — вторичен,
  справа `margin-left:auto`, `0.78rem` `var(--text-muted)`: «охват: N из M».
- Круги/чипы — без изменений: `CircleItem` + `ParticipantInterestChip` (strong-interest при `rank<=3`
  красит чип `var(--accent)`).
- «За бортом» — нейтрально, **без** warning-стиля для зрителя: лейбл «Пока без круга:», имена
  `var(--text-secondary)` (зритель — `font-weight:700` + « · вы», но без оранжевого).

**Копирайт интро панели:** «Расклады по близости интересов. Порядок — только для однозначного вывода:
при равном качестве показываются все варианты, выбор за вами.»

**Тиры (спека §3.4):** coverage-тиры не применяются; индекс 0 → `leader`, остальные → `partial`,
но UI **не** подаёт `leader` как «оптимум».

---

### 4. Смягчённый adrift-баннер
**Файл-цель:** `components/nd/MatchingAdriftBanner.tsx` — копирайт/стиль ветвятся по `mode`.

**В satisfaction остаться без круга — норма by design.** Баннер теряет тревожный регистр:

| | coverage (текущий) | satisfaction (смягчённый) |
|---|---|---|
| Поверхность | `var(--status-warn-soft)` | `var(--bg-input)` |
| Граница | `color-mix(var(--status-warn) 30%)` | `var(--hair)` |
| Левая полоса | `var(--status-warn)` | `var(--accent)` |
| Иконка | `⚠` `1.4rem` `var(--status-warn)` | инфо-кружок `22×22`, `var(--accent-soft)` фон, буква `i` `var(--nd-serif)` `var(--accent)` |
| Заголовок | «Вы за бортом» | «Вы пока не в круге» |
| CTA | «Как вернуться в круг →» (`var(--status-warn)`) | «Где совпадают интересы →» (`var(--accent)`, `border-radius:var(--radius-control)`) |
| Подпись CTA | «добавьте книгу из „Моих ходов“» | «подсказки в „Моих ходах“» |

H2: `var(--nd-serif)` `1.22rem` `700`. Body: `0.85rem` `line-height:1.5` `var(--text-secondary)`, `max-width:64ch`.

**Копирайт satisfaction:**
- Body: «В этом режиме круги собираются по самому близкому совпадению интересов — и не все попадают сразу. Это нормально: посмотрите, что выбирают другие, поднимите свою книгу выше или дождитесь новых участников.»
- Доп. строка (`0.8rem` `var(--text-muted)`): «Ваши приоритеты учтены — вы в подборе. Просто пока не нашлось круга с вашими книгами.»

---

## Interactions & Behavior
- **Селектор режима:** клик по опции переключает выбор; satisfaction раскрывает 3-пунктовый список. Поле блокируется при наличии активной сессии.
- **Gate, drag:** dnd-kit (как в `MatchingPersonalList`), ререндж приоритетов; коммит молчком, без `router.refresh()`. CTA активируется при ≥1 ранге.
- **Gate, CTA:** явная навигация на `/matching` (доска) — единственный выход из гейта.
- **Сценарии:** наведение на чип/ход подсвечивает связанных участников (существующая логика, без изменений).
- **Ходы (спека §5):** в satisfaction ход meaningful, если зритель оказывается лучше (из leftOut → размещён, или строго лучший ранг). Копирайт `MatchingMyMoves.tsx` ветвится по режиму.

## State Management
- `optimizationMode: 'coverage' | 'satisfaction'` — новая колонка `matching_sessions` (спека §1), читается обоими input-билдерами (`fetchScenarioInput` в `page.tsx`, `fetchScenarioInputForSession`).
- Gate: локальный стейт списка/приоритетов (drag), флаг «можно войти» (≥1 ранг). Серверный коммит без refresh.
- Селектор: локальный `mode` в форме до сабмита.

## Design Tokens (используемые; значения — в `app/globals.css`)
- Поверхности: `--bg #F9F5EE`, `--bg-input #FFF`, `--bg-elevated #EDE5D8`, `--accent-soft #F4E7DD`, `--chip-bg #F1EADD`.
- Текст: `--text #111`, `--text-secondary #666`, `--text-muted #999`, `--text-body #333`.
- Акценты: `--accent #C0603A`, `--accent-hover #A04E2E`, `--success #2D6A4F`.
- Линии: `--border #E5E5E5`, `--border-strong #111`, `--hair #ECE3D4`, `--hair-soft #F1EADD`.
- Статус: `--status-warn #F59E0B`, `--status-warn-soft #F3E8D1`.
- Радиусы: `--radius 0`, `--radius-control 8px`, `--radius-card 10px`, `--radius-pill 999px`.
- Тип: `--nd-serif` (Georgia), `--nd-sans` (system-ui), `--nd-mono`.
- Тень: `--shadow-card`.

## Assets
Нет новых ассетов. Обложки книг — через существующий `CoverImage` (по `coverUrl`, фолбэк = инициалы автора).
Иконки — текстовые глифы (`→`, `⠿`, `i`, `⚠`), без иконочного шрифта.

## Files
**Дизайн-референс (в этом бандле, все файлы — рядом с HTML):**
- `Satisfaction Mode — дизайн.html` — точка входа (design-canvas со всеми поверхностями).
- `tokens.css` — токены (зеркало `globals.css`).
- `shared.jsx` — `CoverMock`, `InterestChip`, `interestLabel`, данные.
- `AdminMode.jsx` — селектор режима (поверхность 1).
- `RankingGate.jsx` — экран ранжирования (поверхность 2).
- `Scenarios.jsx` — сценарии satisfaction (поверхность 3).
- `Adrift.jsx` — adrift before/after (поверхность 4).
- `app.jsx`, `design-canvas.jsx` — обвязка канваса.
- `2026-06-05-matching-satisfaction-mode-design.md` — **полная спека фичи** (движок/БД/API/тесты).

**Целевые файлы в codebase** (карта изменений — спека §8):
- Схема/миграция: `lib/db/schema.ts`, `drizzle/0038_matching_optimization_mode.sql`.
- Движок: `lib/matching/scenarios.ts`.
- Гейт/вход: `app/matching/page.tsx`, `lib/matching/scenario-input.ts`.
- Создание: `app/api/matching/sessions/route.ts`, `components/nd/AdminMatchingSession.tsx`.
- Ходы: `lib/matching/move-impact.ts`, `app/api/matching/state/route.ts`, `components/nd/MatchingMyMoves.tsx`.
- UI: **новый** `components/nd/MatchingRankingGate.tsx`, `MatchingScenarios.tsx`, `MatchingImpactWorkspace.tsx`, `MatchingAdriftBanner.tsx`.
