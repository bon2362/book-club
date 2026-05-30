# Matching Editorial Restyle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Привести визуальный стиль страницы `/matching` к редакторскому стилю главной страницы — белый фон, тонкие линии, прямые углы, без теней, Georgia для заголовков книг — не меняя логику, разметку и порядок элементов.

**Architecture:** Чисто косметический слой: меняются inline-style значения и Tailwind-классы в 7 файлах. Центральная точка — `matching-shared.ts` (палитра чипсов). Логика, пропсы и порядок рендеринга не трогаются.

**Tech Stack:** Next.js 14, Tailwind CSS, inline styles (текущий код использует `style={{}}` + Tailwind классы)

---

## Редакторские токены (шпаргалка)

| Роль | Значение |
|---|---|
| Фон страницы / панелей | `#FFFFFF` |
| Основной текст | `#111111` |
| Вторичный текст | `#666666` |
| Приглушённый текст | `#999999` |
| Тонкая линия (рамки, разделители) | `#E5E5E5` |
| Сильная линия (хедер, акцент) | `#111` / `2px solid #000` |
| Акцент (терракота) | `#C0603A` |
| Хедер фон / панели | `#FFFFFF` |
| Хедер нижняя граница | `2px solid #000000` |

**Правило:** не использовать токены `var(--bg)` и т.п. — главная их не использует, всё захардкожено.

---

## Карта файлов

| Файл | Что меняется |
|---|---|
| `components/nd/matching-shared.ts` | `PSEUDONYM_COLORS` → монохром |
| `components/nd/MatchingHeader.tsx` | хедер, чип «Я», аватары, кнопка «Покинуть», поповер |
| `app/matching/page.tsx` | 3 панели (рамки, радиус, тени, заголовки h2), фон страницы |
| `components/nd/MatchingPersonalList.tsx` | шрифт заголовков книг, обложки, разделители |
| `components/nd/MatchingScenarios.tsx` | карточки, метки тира, шрифт заголовков, чипсы |
| `components/nd/MatchingMyMoves.tsx` | карточки, кнопка «Хочу читать», шрифт заголовков, чипсы |
| `components/nd/MatchingBookDetailModal.tsx` | модалка (радиус, тень, теги, чипсы) |

**Тесты:** не нужны — чисто стилевые изменения, логика/пропсы/поведение не меняются.

---

## Task 1: matching-shared.ts — монохромная палитра

**Files:**
- Modify: `components/nd/matching-shared.ts`

- [ ] **Заменить `PSEUDONYM_COLORS` на монохромный набор**

Текущий массив из 16 пастельных цветов заменяется на 16 одинаковых монохромных записей (одно значение, повторённое 16 раз — чтобы индексация по хешу не изменила логику):

```ts
export const PSEUDONYM_COLORS = Array(16).fill({
  chip: 'bg-transparent text-[#444] border border-[#d6d6d6]',
  border: 'border-[#d6d6d6]',
})
```

- [ ] **Проверить typecheck**

```bash
cd /Users/ekoshkin/book-club && npm run typecheck 2>&1 | head -30
```

Ожидается: без ошибок (массив той же формы, функция `getPseudonymColor` не меняется).

- [ ] **Commit**

```bash
cd /Users/ekoshkin/book-club
git checkout -b style/matching-editorial-restyle
git add components/nd/matching-shared.ts
git commit -m "style(matching): монохромная палитра чипсов участников"
```

---

## Task 2: MatchingHeader.tsx — хедер

**Files:**
- Modify: `components/nd/MatchingHeader.tsx`

Цель изменений:
- `<header>`: белый фон, `border-bottom: 2px solid #000`, убрать `backdrop-blur-sm`
- Заголовок сессии: `font-weight: 700`, `color: #111`
- Мета (Группы/Дедлайн/Статус): `font-size: 0.6rem`, UPPERCASE, `letter-spacing: 0.12em`, `color: #999`
- Чип «Я: …»: прозрачный фон, `border: 1px solid #111`, UPPERCASE, без скругления
- Кнопка «Покинуть»: текст-ссылка, `border-bottom: 1px solid #111`, UPPERCASE, без фона
- Аватары: `background: #111`, `color: #fff`, белый border
- Кнопка-попровер с аватарами: `border-radius: 0`, `border: 1px solid #111`
- Popover.Content: `border-radius: 0`

- [ ] **Изменить `<header>` (строки 112–118)**

```tsx
<header
  className="flex items-center justify-between gap-4 px-4 h-14 shrink-0"
  style={{
    background: '#fff',
    borderBottom: '2px solid #000',
  }}
>
```

- [ ] **Изменить заголовок сессии (строки 122–126)**

```tsx
<h1
  className="text-xl leading-none m-0 truncate"
  style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, color: '#111' }}
>
  {sessionName}
</h1>
```

- [ ] **Изменить мета-блок (строки 128–157)**

```tsx
<div
  className="hidden sm:flex items-center gap-3 shrink-0"
  style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#999' }}
>
  <span>Группы по {targetGroupSize}</span>
  {deadlineText && (
    <span>
      Дедлайн:{' '}
      <span style={urgent ? { color: '#C0392B', fontWeight: 600 } : {}}>
        {deadlineText}
      </span>
    </span>
  )}
  {userPseudonym && (
    <span
      style={{
        fontSize: '0.56rem',
        padding: '0.18rem 0.55rem',
        borderRadius: 0,
        fontWeight: 600,
        background: 'transparent',
        color: '#111',
        border: '1px solid #111',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
      }}
    >
      Я: {userPseudonym}
    </span>
  )}
  {sessionStatus === 'frozen' ? (
    <span
      style={{ padding: '0.12rem 0.4rem', background: 'transparent', color: '#999', border: '1px solid #d6d6d6' }}
    >
      Зафиксирована
    </span>
  ) : (
    <span style={{ color: '#2D6A4F' }}>● активна</span>
  )}
</div>
```

- [ ] **Изменить кнопку «Покинуть» (строки 163–177)**

```tsx
{sessionStatus === 'active' && !isImpersonating && (
  <button
    onClick={handleLeave}
    disabled={leaving}
    style={{
      font: 'inherit',
      fontSize: '0.62rem',
      cursor: leaving ? 'default' : 'pointer',
      opacity: leaving ? 0.6 : 1,
      padding: '0 0 1px',
      border: 'none',
      borderBottom: '1px solid #111',
      borderRadius: 0,
      background: 'none',
      color: '#111',
      textTransform: 'uppercase',
      letterSpacing: '0.08em',
    }}
  >
    {leaving ? '…' : 'Покинуть'}
  </button>
)}
```

- [ ] **Изменить аватары и кнопку-поповер (строки 179–214)**

```tsx
<Popover.Trigger asChild>
  <button
    className="flex items-center gap-2 px-3 py-1.5 shrink-0"
    style={{
      borderRadius: 0,
      border: '1px solid #111',
      background: '#fff',
      color: '#666',
      fontSize: '0.8rem',
      cursor: 'pointer',
    }}
  >
    <div className="flex -space-x-2">
      {participants.slice(0, 6).map((p) => (
        <div
          key={p.userId}
          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
          style={{ background: '#111', color: '#fff', border: '2px solid #fff' }}
          title={p.pseudonym}
        >
          {p.pseudonym[0].toUpperCase()}
        </div>
      ))}
      {participants.length > 6 && (
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
          style={{ background: '#fff', color: '#555', border: '1px solid #ccc' }}
        >
          +{participants.length - 6}
        </div>
      )}
    </div>
    <span className="font-medium" style={{ color: '#111' }}>{participants.length}</span>
  </button>
</Popover.Trigger>
```

- [ ] **Изменить Popover.Content (строки 217–267)**

```tsx
<Popover.Content
  className="z-50 border p-3 min-w-[220px] max-w-[300px]"
  style={{
    background: '#fff',
    borderColor: '#E5E5E5',
    borderRadius: 0,
    boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
  }}
  sideOffset={8}
  align="end"
>
```

Аватары внутри поповера (строки 240–245) — тоже менять на `background: '#111', color: '#fff'`:

```tsx
<div
  className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
  style={{ background: '#111', color: '#fff' }}
>
  {p.pseudonym[0].toUpperCase()}
</div>
```

- [ ] **Lint + typecheck**

```bash
cd /Users/ekoshkin/book-club && npm run lint -- --max-warnings=0 2>&1 | tail -20 && npm run typecheck 2>&1 | tail -20
```

- [ ] **Commit**

```bash
cd /Users/ekoshkin/book-club
git add components/nd/MatchingHeader.tsx
git commit -m "style(matching): редакторский хедер — белый фон, чёрная линия, UPPERCASE-мета"
```

---

## Task 3: app/matching/page.tsx — три панели

**Files:**
- Modify: `app/matching/page.tsx`

Цель:
- Фон страницы: `#fff` вместо `var(--bg)`
- Три панели: убрать `rounded-xl`, `boxShadow` → `border: 1px solid #E5E5E5`, `borderRadius: 0`, `background: #fff`
- Заголовки `h2` → UPPERCASE eyebrow: `font-size: 0.62rem`, `letter-spacing: 0.14em`, `color: #999`, `font-weight: 600`
- Состояние «нет активной сессии»: тоже на белый

- [ ] **Изменить фон страницы (строка 202)**

```tsx
<div
  className="flex flex-col"
  style={{ height: '100svh', overflow: 'hidden', background: '#fff', color: '#111' }}
>
```

- [ ] **Изменить левую панель (каталог, строки 228–261)**

```tsx
<div
  className="flex flex-col overflow-hidden min-h-0 border"
  style={{
    background: '#fff',
    borderColor: '#E5E5E5',
    borderRadius: 0,
  }}
>
  <div
    className="px-4 py-3 shrink-0 border-b"
    style={{ borderColor: '#E5E5E5' }}
  >
    <h2
      className="m-0"
      style={{
        fontFamily: 'system-ui, sans-serif',
        fontSize: '0.62rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        color: '#999',
      }}
    >
      {isImpersonating ? 'Список участника' : 'Каталог'}
    </h2>
    {!isImpersonating && (
      <p className="text-xs mt-0.5 m-0" style={{ color: '#999' }}>
        Перетащи книги, чтобы расставить приоритеты
      </p>
    )}
  </div>
```

- [ ] **Изменить правую колонку — панель «Читательские круги» (строки 266–295)**

```tsx
<div
  className="flex flex-col flex-1 overflow-hidden min-h-0 border"
  style={{
    background: '#fff',
    borderColor: '#E5E5E5',
    borderRadius: 0,
  }}
>
  <div
    className="px-4 py-3 shrink-0 border-b"
    style={{ borderColor: '#E5E5E5' }}
  >
    <h2
      className="m-0"
      style={{
        fontFamily: 'system-ui, sans-serif',
        fontSize: '0.62rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        color: '#999',
      }}
      title="Сортировка: макс. участников → больше топ-3 книг → ниже средний ранг"
    >
      Читательские круги
    </h2>
  </div>
```

- [ ] **Изменить панель «Мои ходы» (строки 298–318)**

```tsx
<div
  className="flex flex-col flex-1 overflow-hidden min-h-0 border"
  style={{
    background: '#fff',
    borderColor: '#E5E5E5',
    borderRadius: 0,
  }}
>
  <div
    className="px-4 py-3 shrink-0 border-b"
    style={{ borderColor: '#E5E5E5' }}
  >
    <h2
      className="m-0"
      style={{
        fontFamily: 'system-ui, sans-serif',
        fontSize: '0.62rem',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.14em',
        color: '#999',
      }}
    >
      {isImpersonating ? 'Ходы участника' : 'Мои ходы'}
    </h2>
  </div>
```

- [ ] **Lint + typecheck**

```bash
cd /Users/ekoshkin/book-club && npm run lint -- --max-warnings=0 2>&1 | tail -20 && npm run typecheck 2>&1 | tail -20
```

- [ ] **Commit**

```bash
cd /Users/ekoshkin/book-club
git add app/matching/page.tsx
git commit -m "style(matching): белые панели, прямые углы, UPPERCASE заголовки панелей"
```

---

## Task 4: MatchingPersonalList.tsx — каталог книг

**Files:**
- Modify: `components/nd/MatchingPersonalList.tsx`

Цель:
- `SortableRow`, `StatusRow`, `CatalogRow`: заголовок книги → Georgia, `font-weight: 700`, `letter-spacing: -0.01em`
- Обложки: `borderRadius: 0`
- Разделители («В процессе / Прочитано», «Все книги клуба»): `background: #fafafa`, линии `#E5E5E5`

- [ ] **Изменить `SortableRow` — заголовок и обложка (строки 96–113)**

```tsx
{/* Cover + title + author */}
<div className="flex gap-3 min-w-0">
  <div className="relative overflow-hidden shrink-0" style={{ width: 44, height: 62, borderRadius: 0 }}>
    <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
  </div>
  <div className="min-w-0">
    <div
      className="leading-snug mb-0.5"
      style={{
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontWeight: 700,
        fontSize: '0.9rem',
        letterSpacing: '-0.01em',
        color: '#111',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {book.title}
    </div>
    <div
      className="text-xs"
      style={{ color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
    >
      {book.author}
    </div>
  </div>
</div>
```

- [ ] **Изменить `StatusRow` — заголовок и обложка (строки 142–160)**

Те же замены: `borderRadius: 0` на обложке, Georgia+700+`-0.01em` на заголовке, `color: '#111'` для заголовка, `color: '#999'` для автора.

- [ ] **Изменить `CatalogRow` — заголовок и обложка (строки 187–207)**

Те же замены: `borderRadius: 0` на обложке, Georgia+700+`-0.01em` на заголовке, `color: '#111'` для заголовка, `color: '#999'` для автора.

- [ ] **Изменить разделители (строки 407–421 и 434–443)**

```tsx
{/* Разделитель «В процессе / Прочитано» */}
<div
  className="px-4 py-2 border-b border-t"
  style={{ borderColor: '#E5E5E5', background: '#fafafa' }}
>
  <span
    className="text-[11px] font-medium uppercase tracking-wide block"
    style={{ color: '#999' }}
  >
    В процессе / Прочитано
  </span>
  <span
    className="text-[10px] block mt-0.5"
    style={{ color: '#999', opacity: 0.75 }}
  >
    исключены при расчёте ваших сценариев и ходов
  </span>
</div>

{/* Разделитель «Все книги клуба» */}
<div
  className="px-4 py-2 border-b border-t"
  style={{ borderColor: '#E5E5E5', background: '#fafafa' }}
>
  <span
    className="text-[11px] font-medium uppercase tracking-wide"
    style={{ color: '#999' }}
  >
    Все книги клуба
  </span>
</div>
```

- [ ] **Lint + typecheck**

```bash
cd /Users/ekoshkin/book-club && npm run lint -- --max-warnings=0 2>&1 | tail -20 && npm run typecheck 2>&1 | tail -20
```

- [ ] **Commit**

```bash
cd /Users/ekoshkin/book-club
git add components/nd/MatchingPersonalList.tsx
git commit -m "style(matching): Georgia для заголовков книг в каталоге, прямые углы, белые разделители"
```

---

## Task 5: MatchingScenarios.tsx — читательские круги

**Files:**
- Modify: `components/nd/MatchingScenarios.tsx`

Цель:
- `tierConfig`: убрать `var(--bg-tag-green)` → leader: `{ background: '#fff', borderTop: '2px solid #111', borderLeft: 'none', borderRight: 'none', borderBottom: 'none' }`; остальные: `{ background: '#fff', border: '1px solid #E5E5E5' }`
- Карточка `ScenarioItem`: `borderRadius: 0`, убрать `rounded-xl`
- Метки тира: убрать `rounded-full`, добавить `border-bottom: 1px solid currentColor`, UPPERCASE; лидер → `#C0603A`; макс. покрытие → `#999`; альтернатива → `#999`
- Заголовок книги (button): Georgia serif
- Обложка: `borderRadius: 0`
- Чипы «за бортом» (leftOut) и участников: убрать `rounded-full`

- [ ] **Изменить `tierConfig` (строки 22–38)**

```ts
const tierConfig = {
  leader: {
    style: { background: '#fff', borderTop: '2px solid #111', borderLeft: 'none' as const, borderRight: 'none' as const, borderBottom: 'none' as const, borderRadius: 0 },
    label: 'лидер',
    labelStyle: { color: '#C0603A' },
  },
  'max-coverage': {
    style: { background: '#fff', border: '1px solid #E5E5E5', borderRadius: 0 },
    label: 'макс. покрытие',
    labelStyle: { color: '#999' },
  },
  'sub-max': {
    style: { background: '#fff', border: '1px solid #E5E5E5', borderRadius: 0 },
    label: null,
    labelStyle: {},
  },
} as const
```

- [ ] **Изменить чипы «за бортом» (leftOut, строки 84–89)**

```tsx
{overview.leftOut.map((p) => (
  <span
    key={p.userId}
    className={`inline-flex items-center px-2 py-0.5 text-[11px] ${getPseudonymColor(p.pseudonym).chip}`}
    style={{ borderRadius: 0 }}
  >
    {p.pseudonym}
  </span>
))}
```

- [ ] **Изменить `ScenarioItem` — карточка (строки 152–198)**

Обёртка `<li>`:

```tsx
<li
  className="border p-3.5"
  style={isAlternative
    ? { background: '#fff', border: '1px solid #E5E5E5', borderRadius: 0 }
    : { ...tier.style }
  }
>
```

Метка тира:

```tsx
{label && (
  <span
    className="text-[10px] shrink-0"
    style={{
      ...labelStyle,
      borderBottom: '1px solid currentColor',
      borderTop: 'none',
      borderLeft: 'none',
      borderRight: 'none',
      borderRadius: 0,
      textTransform: 'uppercase',
      letterSpacing: '0.12em',
      padding: '0 0 1px',
    }}
  >
    {label}
  </span>
)}
```

Кнопка заголовка книги:

```tsx
<button
  onClick={() => book && onOpen(book)}
  className="text-left leading-snug hover:underline"
  style={{
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontWeight: 700,
    fontSize: '0.92rem',
    letterSpacing: '-0.01em',
    color: '#111',
  }}
>
  {book?.title ?? card.bookId}
</button>
```

Обложка:

```tsx
<div className="relative overflow-hidden shrink-0" style={{ width: 40, height: 56, borderRadius: 0 }}>
```

Чипы участников:

```tsx
{card.members.map((m) => (
  <span
    key={m.userId}
    className={`inline-flex items-center px-2 py-0.5 text-[11px] ${getPseudonymColor(m.pseudonym).chip}`}
    style={{ borderRadius: 0 }}
  >
    {m.pseudonym}
    <span className="ml-1 opacity-70">· {m.interest}</span>
  </span>
))}
```

- [ ] **Lint + typecheck**

```bash
cd /Users/ekoshkin/book-club && npm run lint -- --max-warnings=0 2>&1 | tail -20 && npm run typecheck 2>&1 | tail -20
```

- [ ] **Commit**

```bash
cd /Users/ekoshkin/book-club
git add components/nd/MatchingScenarios.tsx
git commit -m "style(matching): редакторские карточки сценариев — белый фон, UPPERCASE-метки, Georgia"
```

---

## Task 6: MatchingMyMoves.tsx — мои ходы

**Files:**
- Modify: `components/nd/MatchingMyMoves.tsx`

Цель:
- Карточки: `borderRadius: 0`, `borderLeft: 2px solid #C0603A`, белый фон (убрать `var(--bg-tag-green)`)
- Обложка: `borderRadius: 0`
- Заголовок книги: Georgia
- Чипы участников: убрать `rounded-full`
- «Хочу читать» button: `borderRadius: 0`, `background: #111`, `borderColor: #111`, UPPERCASE `0.72rem`, `letter-spacing: 0.08em`

- [ ] **Изменить карточку (строки 71–133)**

`<li>`:

```tsx
<li
  key={move.bookId}
  className="border p-3"
  style={{
    borderRadius: 0,
    borderLeft: '2px solid #C0603A',
    borderTop: '1px solid #E5E5E5',
    borderRight: '1px solid #E5E5E5',
    borderBottom: '1px solid #E5E5E5',
    background: '#fff',
  }}
>
```

Обложка:

```tsx
<div className="relative overflow-hidden shrink-0" style={{ width: 40, height: 56, borderRadius: 0 }}>
```

Заголовок книги:

```tsx
<button
  type="button"
  onClick={() => setModalBook(move)}
  className="text-left hover:underline"
  style={{
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontWeight: 700,
    fontSize: '0.9rem',
    letterSpacing: '-0.01em',
    color: '#111',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'block',
    maxWidth: '100%',
    marginBottom: '0.15rem',
  }}
>
  {move.title}
</button>
```

Чипы «Уже записались»:

```tsx
{move.existingParticipants.map((p) => (
  <span
    key={p.pseudonym}
    className={`inline-flex items-center px-2 py-0.5 text-[11px] ${getPseudonymColor(p.pseudonym).chip}`}
    style={{ borderRadius: 0 }}
  >
    {p.pseudonym}
  </span>
))}
```

Кнопка «Хочу читать»:

```tsx
<button
  onClick={() => handleAdd(move.bookId)}
  disabled={adding === move.bookId}
  className="w-full py-2 px-3 font-semibold"
  style={
    adding === move.bookId
      ? {
          borderRadius: 0,
          background: '#E5E5E5',
          border: '1px solid #E5E5E5',
          color: '#999',
          cursor: 'default',
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }
      : {
          borderRadius: 0,
          background: '#111',
          border: '1px solid #111',
          color: '#fff',
          cursor: 'pointer',
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }
  }
>
  {adding === move.bookId ? '…' : 'Хочу читать'}
</button>
```

- [ ] **Lint + typecheck**

```bash
cd /Users/ekoshkin/book-club && npm run lint -- --max-warnings=0 2>&1 | tail -20 && npm run typecheck 2>&1 | tail -20
```

- [ ] **Commit**

```bash
cd /Users/ekoshkin/book-club
git add components/nd/MatchingMyMoves.tsx
git commit -m "style(matching): редакторские карточки «Мои ходы» — терракотовая левая линия, #111 кнопка"
```

---

## Task 7: MatchingBookDetailModal.tsx — модалка

**Files:**
- Modify: `components/nd/MatchingBookDetailModal.tsx`

Цель:
- `dialog`: `borderRadius: 0`, более мягкая тень, `border: 1px solid #E5E5E5`
- Кнопка закрытия: `rounded-none` (убрать `rounded-full`)
- Теги: `borderRadius: 0`, убрать bg
- Чипы участников: убрать `rounded-full`
- Кнопка «Убрать из списка»: прямые углы
- Кнопка «Добавить в список»: прямые углы, цвет `#111`

- [ ] **Изменить `<div role="dialog">` (строки 91–99)**

```tsx
<div
  role="dialog"
  aria-modal="true"
  aria-label={book.title}
  onClick={(e) => e.stopPropagation()}
  className="relative border max-w-[720px] w-full"
  style={{
    background: '#fff',
    borderColor: '#E5E5E5',
    borderRadius: 0,
    boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
    maxHeight: '86vh',
    overflowY: 'auto',
  }}
>
```

- [ ] **Изменить кнопку закрытия (строки 100–113)**

```tsx
<button
  type="button"
  onClick={onClose}
  aria-label="Закрыть"
  className="absolute top-3 right-3 h-8 w-8 border text-lg leading-none"
  style={{
    borderRadius: 0,
    borderColor: '#E5E5E5',
    background: '#fff',
    color: '#999',
    cursor: 'pointer',
  }}
>
  ×
</button>
```

- [ ] **Изменить теги (строки 138–149)**

```tsx
{book.tags.map((tag) => (
  <span
    key={tag}
    className="text-[11px] uppercase px-2 py-0.5 border"
    style={{
      color: '#999',
      borderColor: '#d6d6d6',
      background: 'transparent',
      borderRadius: 0,
    }}
  >
    {tag}
  </span>
))}
```

- [ ] **Изменить чипы участников (строки 201–211)**

```tsx
<span
  key={p.userId}
  className={`inline-flex items-center px-2 py-0.5 text-[11px] border ${colors.chip} ${isMe ? 'ring-1 ring-current' : ''}`}
  style={{ borderRadius: 0 }}
  title={isMe ? 'Это вы' : undefined}
>
  {p.pseudonym} · {label}{rankStr}
</span>
```

- [ ] **Изменить кнопки (строки 239–268)**

Кнопка «Убрать из списка»:

```tsx
<button
  onClick={handleRemoveFromList}
  disabled={busy}
  className="flex-1 text-sm py-2 px-3 border"
  style={{
    borderRadius: 0,
    borderColor: '#E5E5E5',
    background: '#fff',
    color: '#666',
    cursor: busy ? 'default' : 'pointer',
  }}
>
  {busy ? '…' : 'Убрать из списка'}
</button>
```

Кнопка «Добавить в список»:

```tsx
<button
  onClick={handleAddToList}
  disabled={busy}
  className="flex-1 text-sm py-2 px-3 font-medium"
  style={{
    borderRadius: 0,
    border: '1px solid #111',
    background: '#111',
    color: '#fff',
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.7 : 1,
  }}
>
  {busy ? '…' : 'Добавить в список'}
</button>
```

- [ ] **Lint + typecheck**

```bash
cd /Users/ekoshkin/book-club && npm run lint -- --max-warnings=0 2>&1 | tail -20 && npm run typecheck 2>&1 | tail -20
```

- [ ] **Commit**

```bash
cd /Users/ekoshkin/book-club
git add components/nd/MatchingBookDetailModal.tsx
git commit -m "style(matching): редакторская модалка — прямые углы, монохромные теги и чипсы"
```

---

## Финальный шаг — PR

- [ ] **Проверить итог**

```bash
cd /Users/ekoshkin/book-club && npm run lint -- --max-warnings=0 && npm run typecheck
```

- [ ] **Создать PR**

```bash
cd /Users/ekoshkin/book-club
gh pr create --title "style(matching): редакторский стиль — белый фон, прямые углы, Georgia, монохром" --body "$(cat <<'EOF'
## Summary
- Монохромная палитра чипсов участников (вместо 16 пастельных цветов)
- Редакторский хедер: белый фон, `border-bottom: 2px solid #000`, UPPERCASE-мета, квадратные элементы
- Три панели: `border-radius: 0`, без теней, рамка `1px solid #E5E5E5`
- Georgia для заголовков книг в каталоге, сценариях и ходах
- Карточки-лидеры: белый фон + `border-top: 2px solid #111` вместо зелёного тинта
- Карточки «Мои ходы»: `border-left: 2px solid #C0603A`, кнопка «Хочу читать» → `#111`
- Модалка: `border-radius: 0`, мягкая тень, квадратные теги и чипсы

## Test plan
- [ ] Визуально сверить с `Matching — До и После.html` (режим «Стиль главной»)
- [ ] Проверить что drag-and-drop каталога работает
- [ ] Проверить кнопку «Покинуть» (диалог + редирект)
- [ ] Проверить кнопку «Хочу читать» в ходах
- [ ] Проверить модалку книги
- [ ] E2E: не нужны — стилевые изменения без смены логики

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --auto --squash --delete-branch
```
