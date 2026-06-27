# Satisfaction My Moves — понятные пояснения Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить технические формулировки «↑ ранг 20→1» в карточках «Мои ходы» (satisfaction-режим) на понятные пользователю тексты с именами и конкретными позициями, и расширить отбор ходов на альтруистичные (улучшают расклад для других, но не для зрителя).

**Architecture:** Три слоя изменений: (1) генератор статичной таблицы склонений псевдонимов (`scripts/`) + рантайм-хелпер (`lib/matching/`); (2) логика `move-impact.ts` — расширение beneficiary-данных и нового критерия отбора; (3) компонент `MatchingMyMoves.tsx` — новый копирайтинг пилюли и why-text.

**Tech Stack:** TypeScript, React, `russian-nouns-js` (devDependency), Jest, Playwright

**Spec:** [`docs/superpowers/specs/2026-06-07-satisfaction-my-moves-design.md`](../specs/2026-06-07-satisfaction-my-moves-design.md)

---

## Карта файлов

| Файл | Что меняем / создаём |
|---|---|
| `scripts/generate-pseudonym-declensions.ts` | **Создаём** — dev-генератор, читает ANIMALS + карту рода, пишет *.generated.ts |
| `lib/matching/pseudonym-gender.ts` | **Создаём** — карта рода для всех ANIMALS (м/ж/с), source-of-truth для генератора |
| `lib/matching/pseudonym-declensions.generated.ts` | **Создаём** (генерируется скриптом) — статичная таблица падежей |
| `lib/matching/pseudonym-declension.ts` | **Создаём** — рантайм API: `declinePseudonym`, `pseudonymPronoun` |
| `lib/matching/__tests__/pseudonym-declension.test.ts` | **Создаём** — тесты хелпера |
| `lib/matching/move-impact.ts` | **Меняем** — данные beneficiary (rankBefore/afterRank), логика отбора в satisfaction |
| `lib/matching/__tests__/move-impact.test.ts` | **Меняем** — новые тест-кейсы |
| `components/nd/MatchingMyMoves.tsx` | **Меняем** — ImpactMetricPills + MoveWhyText в satisfaction |
| `docs/wiki/Group-Matching-Mode.md` | **Меняем** — описание ходов в satisfaction |

---

## Task 1: Карта рода псевдонимов

**Files:**
- Create: `lib/matching/pseudonym-gender.ts`

- [ ] **Step 1.1: Создать файл с картой рода**

Создать `lib/matching/pseudonym-gender.ts`. Заполнить все ~200 животных:

```typescript
// Грамматический род псевдонимов для склонения.
// м = мужской, ж = женский, с = средний
export const PSEUDONYM_GENDER: Record<string, 'м' | 'ж' | 'с'> = {
  // Звери
  'Барсук': 'м', 'Бегемот': 'м', 'Белка': 'ж', 'Бобёр': 'м', 'Бурундук': 'м',
  'Верблюд': 'м', 'Волк': 'м', 'Выдра': 'ж', 'Выхухоль': 'ж', 'Гепард': 'м',
  'Горностай': 'м', 'Гризли': 'м', 'Дикобраз': 'м', 'Енот': 'м', 'Ёж': 'м',
  'Зебра': 'ж', 'Зубр': 'м', 'Зяблик': 'м', 'Кабан': 'м', 'Кабарга': 'ж',
  'Кенгуру': 'м', 'Кит': 'м', 'Козуля': 'ж', 'Кот': 'м', 'Кролик': 'м',
  'Кугуар': 'м', 'Куница': 'ж', 'Лемур': 'м', 'Лиса': 'ж', 'Лось': 'м',
  'Лошадь': 'ж', 'Лягушка': 'ж', 'Маралка': 'ж', 'Медведь': 'м', 'Мышь': 'ж',
  'Нарвал': 'м', 'Норка': 'ж', 'Нутрия': 'ж', 'Овца': 'ж', 'Олень': 'м',
  'Осёл': 'м', 'Пантера': 'ж', 'Панда': 'ж', 'Песец': 'м',
  'Пингвин': 'м', 'Пума': 'ж', 'Рысь': 'ж',
  'Серна': 'ж', 'Сивуч': 'м', 'Скунс': 'м', 'Слон': 'м', 'Соболь': 'м',
  'Сурок': 'м', 'Суслик': 'м', 'Тапир': 'м', 'Тигр': 'м', 'Тюлень': 'м',
  'Хомяк': 'м', 'Хорёк': 'м', 'Шакал': 'м', 'Ягуар': 'м',
  // Птицы
  'Аист': 'м', 'Альбатрос': 'м', 'Баклан': 'м', 'Беркут': 'м',
  'Буревестник': 'м', 'Вальдшнеп': 'м', 'Воробей': 'м', 'Ворон': 'м', 'Ворона': 'ж',
  'Гагара': 'ж', 'Гагарка': 'ж', 'Глухарь': 'м', 'Голубь': 'м', 'Горлица': 'ж',
  'Грач': 'м', 'Дрозд': 'м', 'Дятел': 'м', 'Журавль': 'м', 'Зарянка': 'ж',
  'Зимородок': 'м', 'Зуёк': 'м', 'Иволга': 'ж', 'Казарка': 'ж', 'Кайра': 'ж',
  'Камышёвка': 'ж', 'Кеклик': 'м', 'Кобчик': 'м', 'Козодой': 'м', 'Колибри': 'с',
  'Коноплянка': 'ж', 'Коршун': 'м', 'Кречет': 'м', 'Крохаль': 'м', 'Кукушка': 'ж',
  'Куропатка': 'ж', 'Лебедь': 'м', 'Лунь': 'м', 'Малиновка': 'ж', 'Мартын': 'м',
  'Мухоловка': 'ж', 'Неясыть': 'ж', 'Нырок': 'м', 'Овсянка': 'ж', 'Орёл': 'м',
  'Орлан': 'м', 'Пеночка': 'ж', 'Перепел': 'м', 'Петух': 'м', 'Пигалица': 'ж',
  'Погоныш': 'м', 'Поползень': 'м', 'Рябчик': 'м', 'Свиристель': 'м', 'Синица': 'ж',
  'Сипуха': 'ж', 'Скворец': 'м', 'Славка': 'ж', 'Сова': 'ж', 'Сокол': 'м',
  'Сорока': 'ж', 'Стриж': 'м', 'Тетерев': 'м', 'Трясогузка': 'ж', 'Удод': 'м',
  'Утка': 'ж', 'Филин': 'м', 'Чайка': 'ж', 'Чеглок': 'м', 'Чечевица': 'ж',
  'Чечётка': 'ж', 'Чибис': 'м', 'Широконоска': 'ж', 'Щегол': 'м', 'Щурка': 'ж',
  // Рыбы и морские
  'Акула': 'ж', 'Белуга': 'ж', 'Бычок': 'м', 'Горбуша': 'ж', 'Дельфин': 'м',
  'Ёрш': 'м', 'Зубатка': 'ж', 'Камбала': 'ж', 'Карась': 'м', 'Карп': 'м',
  'Кета': 'ж', 'Кефаль': 'ж', 'Краб': 'м', 'Креветка': 'ж', 'Кутум': 'м',
  'Лещ': 'м', 'Линь': 'м', 'Лосось': 'м', 'Макрель': 'ж', 'Мальма': 'ж',
  'Минтай': 'м', 'Мойва': 'ж', 'Морж': 'м', 'Мурена': 'ж', 'Навага': 'ж',
  'Нельма': 'ж', 'Нерка': 'ж', 'Окунь': 'м', 'Осётр': 'м', 'Палтус': 'м',
  'Пескарь': 'м', 'Плотва': 'ж', 'Пузанок': 'м', 'Рак': 'м', 'Рыбец': 'м',
  'Сайда': 'ж', 'Сайра': 'ж', 'Сардина': 'ж', 'Сёмга': 'ж', 'Сиг': 'м',
  'Скат': 'м', 'Ставрида': 'ж', 'Стерлядь': 'ж', 'Судак': 'м', 'Таймень': 'м',
  'Тунец': 'м', 'Угорь': 'м', 'Уклейка': 'ж', 'Форель': 'ж', 'Хариус': 'м',
  'Чехонь': 'ж', 'Щука': 'ж', 'Язь': 'м',
  // Насекомые и другие
  'Богомол': 'м', 'Бражник': 'м', 'Веснянка': 'ж', 'Гусеница': 'ж', 'Жук': 'м',
  'Жужелица': 'ж', 'Кузнечик': 'м', 'Медведка': 'ж', 'Муравей': 'м', 'Оса': 'ж',
  'Пчела': 'ж', 'Саранча': 'ж', 'Светляк': 'м', 'Стрекоза': 'ж', 'Усач': 'м',
  'Шмель': 'м', 'Мотылёк': 'м', 'Клоп': 'м', 'Листоед': 'м', 'Скарабей': 'м',
}
```

- [ ] **Step 1.2: Commit**

```bash
git add lib/matching/pseudonym-gender.ts
git commit -m "feat(matching): карта рода псевдонимов для склонений"
```

---

## Task 2: Генератор таблицы склонений

**Files:**
- Create: `scripts/generate-pseudonym-declensions.ts`
- Create: `lib/matching/pseudonym-declensions.generated.ts` (результат запуска)

- [ ] **Step 2.1: Установить devDependency**

```bash
npm install --save-dev russian-nouns-js
```

- [ ] **Step 2.2: Создать скрипт генератора**

Создать `scripts/generate-pseudonym-declensions.ts`:

```typescript
#!/usr/bin/env npx tsx
// AUTO-RUN: npx tsx scripts/generate-pseudonym-declensions.ts
// Writes lib/matching/pseudonym-declensions.generated.ts

import RussianNouns from 'russian-nouns-js'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { ANIMALS } from '../lib/matching/pseudonyms'
import { PSEUDONYM_GENDER } from '../lib/matching/pseudonym-gender'

const rne = new RussianNouns.Engine()
const Case = RussianNouns.Case
const Gender = RussianNouns.Gender

const GENDER_MAP: Record<'м' | 'ж' | 'с', string> = {
  'м': Gender.MASCULINE,
  'ж': Gender.FEMININE,
  'с': Gender.NEUTER,
}

export interface PseudonymDeclension {
  nom: string   // именительный (= имя)
  gen: string   // родительный: у Барсука
  dat: string   // дательный: Барсуку
  acc: string   // винительный: вижу Барсука
  ins: string   // творительный: с Барсуком
  pre: string   // предложный: о Барсуке
  gender: 'м' | 'ж' | 'с'
}

const result: Record<string, PseudonymDeclension> = {}

for (const name of ANIMALS) {
  const g = PSEUDONYM_GENDER[name]
  if (!g) {
    console.warn(`No gender for ${name}, skipping`)
    continue
  }
  const lemma = RussianNouns.Lemma.create({ text: name, gender: GENDER_MAP[g] })
  const decline = (c: unknown) => {
    const forms = rne.decline(lemma, c as string)
    return forms[0] ?? name
  }
  result[name] = {
    nom: name,
    gen: decline(Case.GENITIVE),
    dat: decline(Case.DATIVE),
    acc: decline(Case.ACCUSATIVE),
    ins: decline(Case.INSTRUMENTAL),
    pre: decline(Case.PREPOSITIONAL),
    gender: g,
  }
}

const lines = Object.entries(result).map(([name, d]) =>
  `  ${JSON.stringify(name)}: ${JSON.stringify(d)},`
)

const output = `// AUTO-GENERATED by scripts/generate-pseudonym-declensions.ts — do not edit by hand.
// Run: npx tsx scripts/generate-pseudonym-declensions.ts
import type { PseudonymDeclension } from './pseudonym-declension'
export { type PseudonymDeclension }

export const PSEUDONYM_DECLENSIONS: Record<string, PseudonymDeclension> = {
${lines.join('\n')}
}
`

const outPath = join(__dirname, '../lib/matching/pseudonym-declensions.generated.ts')
writeFileSync(outPath, output, 'utf8')
console.log(`Written ${Object.keys(result).length} entries to ${outPath}`)
```

- [ ] **Step 2.3: Запустить генератор**

```bash
npx tsx scripts/generate-pseudonym-declensions.ts
```

Ожидаем: `Written N entries to .../pseudonym-declensions.generated.ts`

- [ ] **Step 2.4: Убедиться, что файл создан и содержит ключи**

```bash
head -15 lib/matching/pseudonym-declensions.generated.ts
grep '"Барсук"' lib/matching/pseudonym-declensions.generated.ts
grep '"Выхухоль"' lib/matching/pseudonym-declensions.generated.ts
grep '"Неясыть"' lib/matching/pseudonym-declensions.generated.ts
```

Ожидаем: строки с объектами, дательный у «Барсук» — `"Барсуку"`, у «Выхухоль» — `"Выхухоли"`, у «Неясыть» — `"Неясыти"`.

Если дательный очевидно неверен — поправить `PSEUDONYM_GENDER` в `lib/matching/pseudonym-gender.ts` и перегенерировать. Оверрайды для единичных исправлений — в Task 3.

- [ ] **Step 2.5: Commit**

```bash
git add scripts/generate-pseudonym-declensions.ts lib/matching/pseudonym-declensions.generated.ts package.json package-lock.json
git commit -m "feat(matching): генератор склонений псевдонимов (russian-nouns-js)"
```

---

## Task 3: Рантайм API склонений + оверрайды

**Files:**
- Create: `lib/matching/pseudonym-declension.ts`
- Create: `lib/matching/__tests__/pseudonym-declension.test.ts`

- [ ] **Step 3.1: Написать падающий тест**

Создать `lib/matching/__tests__/pseudonym-declension.test.ts`:

```typescript
import { declinePseudonym, pseudonymPronoun } from '../pseudonym-declension'

describe('declinePseudonym', () => {
  it('returns dative for Барсук', () => {
    expect(declinePseudonym('Барсук', 'dat')).toBe('Барсуку')
  })

  it('returns dative for Белка (feminine)', () => {
    expect(declinePseudonym('Белка', 'dat')).toBe('Белке')
  })

  it('returns dative for Лягушка', () => {
    expect(declinePseudonym('Лягушка', 'dat')).toBe('Лягушке')
  })

  it('returns nominative as fallback for unknown name', () => {
    expect(declinePseudonym('Единорог', 'dat')).toBe('Единорог')
  })

  it('returns genitive for Журавль', () => {
    expect(declinePseudonym('Журавль', 'gen')).toBe('Журавля')
  })
})

describe('pseudonymPronoun', () => {
  it('returns он for masculine', () => {
    expect(pseudonymPronoun('Барсук', 'он')).toBe('он')
  })

  it('returns она for feminine', () => {
    expect(pseudonymPronoun('Белка', 'он')).toBe('она')
  })

  it('returns ему for masculine dative', () => {
    expect(pseudonymPronoun('Барсук', 'ему')).toBe('ему')
  })

  it('returns ей for feminine dative', () => {
    expect(pseudonymPronoun('Белка', 'ему')).toBe('ей')
  })

  it('returns его for masculine genitive', () => {
    expect(pseudonymPronoun('Барсук', 'его')).toBe('его')
  })

  it('returns её for feminine genitive', () => {
    expect(pseudonymPronoun('Белка', 'его')).toBe('её')
  })

  it('returns он as fallback for unknown name', () => {
    expect(pseudonymPronoun('Единорог', 'он')).toBe('он')
  })
})
```

- [ ] **Step 3.2: Запустить тест — убедиться, что падает**

```bash
npx jest lib/matching/__tests__/pseudonym-declension.test.ts --no-coverage
```

Ожидаем: `Cannot find module '../pseudonym-declension'`

- [ ] **Step 3.3: Создать рантайм API**

Создать `lib/matching/pseudonym-declension.ts`:

```typescript
import { PSEUDONYM_DECLENSIONS } from './pseudonym-declensions.generated'

export type { PseudonymDeclension } from './pseudonym-declensions.generated'

type DeclCase = 'nom' | 'gen' | 'dat' | 'acc' | 'ins' | 'pre'
type PronounForm = 'он' | 'ему' | 'его' | 'него'

// Ручные оверрайды для зверей, где russian-nouns-js ошибся.
// Структура та же, что PseudonymDeclension — достаточно указать нужные падежи.
const OVERRIDES: Record<string, Partial<Record<DeclCase, string>>> = {
  // Пример: 'Выхухоль': { dat: 'Выхухоли' },
  // Заполнить после ревью с владельцем (Task 2.4)
}

export function declinePseudonym(name: string, c: DeclCase): string {
  const override = OVERRIDES[name]?.[c]
  if (override) return override
  const entry = PSEUDONYM_DECLENSIONS[name]
  return entry ? entry[c] : name
}

export function pseudonymPronoun(name: string, form: PronounForm): string {
  const entry = PSEUDONYM_DECLENSIONS[name]
  const gender = entry?.gender ?? 'м'

  if (gender === 'ж') {
    const femMap: Record<PronounForm, string> = { 'он': 'она', 'ему': 'ей', 'его': 'её', 'него': 'неё' }
    return femMap[form]
  }
  if (gender === 'с') {
    const neuMap: Record<PronounForm, string> = { 'он': 'оно', 'ему': 'ему', 'его': 'его', 'него': 'него' }
    return neuMap[form]
  }
  // masculine (default)
  const mascMap: Record<PronounForm, string> = { 'он': 'он', 'ему': 'ему', 'его': 'его', 'него': 'него' }
  return mascMap[form]
}
```

- [ ] **Step 3.4: Запустить тесты — убедиться, что проходят**

```bash
npx jest lib/matching/__tests__/pseudonym-declension.test.ts --no-coverage
```

Ожидаем: все тесты `PASS`.

- [ ] **Step 3.5: Commit**

```bash
git add lib/matching/pseudonym-declension.ts lib/matching/__tests__/pseudonym-declension.test.ts
git commit -m "feat(matching): рантайм API склонений псевдонимов (declinePseudonym, pseudonymPronoun)"
```

---

## Task 4: Расширение данных beneficiary (ранги до/после)

**Files:**
- Modify: `lib/matching/move-impact.ts`
- Modify: `lib/matching/__tests__/move-impact.test.ts`

Цель: добавить `rankBefore` и `afterRank` в каждый beneficiary, чтобы why-text мог показывать конкретные позиции.

- [ ] **Step 4.1: Написать падающий тест (новые поля)**

В `lib/matching/__tests__/move-impact.test.ts` добавить новый describe-блок **в конец файла**:

```typescript
describe('satisfaction mode — rank-based beneficiary data', () => {
  const makeLeader = (circles: MatchingScenario['circles']): MatchingScenario => ({
    id: 'before',
    tier: 'leader',
    score: {
      coveredCount: 3, totalCount: 5, coverageRatio: 0.6,
      strongInterestCount: 1, rankedCount: 3, unrankedCount: 0,
      rankSum: 9, avgRank: 3, worstRank: 20,
    },
    leftOut: [],
    circles,
  })

  it('puts rankBefore and afterRank in circle beneficiary', () => {
    const currentLeader = makeLeader([{
      id: 'old',
      bookId: 'old',
      minSize: 3, maxSize: 3,
      wantsCount: 1, avgRank: 10, worstRank: 20, unrankedCount: 0,
      members: [
        { userId: 'viewer', pseudonym: 'Нарвал', rank: 5, interest: 'хочу' },
        { userId: 'u2', pseudonym: 'Барсук', rank: 20, interest: 'хочу' },
      ],
    }])
    const nextLeader: MatchingScenario = {
      id: 'after',
      tier: 'leader',
      score: {
        coveredCount: 3, totalCount: 5, coverageRatio: 0.6,
        strongInterestCount: 2, rankedCount: 3, unrankedCount: 0,
        rankSum: 3, avgRank: 1.5, worstRank: 2,
      },
      leftOut: [],
      circles: [{
        id: 'new',
        bookId: 'new',
        minSize: 3, maxSize: 3,
        wantsCount: 2, avgRank: 1.5, worstRank: 2, unrankedCount: 0,
        members: [
          { userId: 'viewer', pseudonym: 'Нарвал', rank: 2, interest: 'очень хочу' },
          { userId: 'u2', pseudonym: 'Барсук', rank: 1, interest: 'очень хочу' },
        ],
      }],
    }

    const impact = buildMoveImpact({
      move: { ...move('New'), bookId: 'new' },
      scenario: nextLeader,
      currentLeader,
      viewingUserId: 'viewer',
      bookTitleById: new Map([['old', 'Старая'], ['new', 'Новая']]),
      mode: 'satisfaction',
    })

    expect(impact).not.toBeNull()
    const barsuк = impact!.beneficiaries.find(b => b.pseudonym === 'Барсук')
    expect(barsuк).toBeDefined()
    expect(barsuк!.before).toMatchObject({ place: 'circle', rankBefore: 20 })
    expect(barsuк!.afterRank).toBe(1)
  })
})
```

- [ ] **Step 4.2: Запустить тест — убедиться, что падает**

```bash
npx jest lib/matching/__tests__/move-impact.test.ts --no-coverage
```

Ожидаем: тест падает с ошибкой про отсутствие `rankBefore` / `afterRank`.

- [ ] **Step 4.3: Обновить типы и данные в `move-impact.ts`**

В `lib/matching/move-impact.ts` обновить тип beneficiary и логику сборки:

```typescript
// В типе MyMoveBook['impact'].beneficiaries (объявлен в my-moves.ts):
// Обновить поле before для circle-варианта:
//   before: { place: 'circle'; bookTitle: string; interest: GroupMember['interest']; rankBefore: number | null }
// Добавить поле:
//   afterRank: number | null
```

В `lib/matching/my-moves.ts` обновить тип `MyMoveBook`:

```typescript
// Найти в beneficiaries объявление before circle-варианта:
before:
  | { place: 'leftOut' }
  | { place: 'circle'; bookTitle: string; interest: GroupMember['interest']; rankBefore: number | null }
// Добавить:
afterRank: number | null
```

В `lib/matching/move-impact.ts` обновить `placeBefore` — хранить ранг:

```typescript
// Было:
const placeBefore = new Map<string, { bookId: string; interest: GroupMember['interest'] }>()
for (const circle of currentLeader?.circles ?? []) {
  for (const member of circle.members) {
    placeBefore.set(member.userId, { bookId: circle.bookId, interest: member.interest })
  }
}

// Стало:
const placeBefore = new Map<string, { bookId: string; interest: GroupMember['interest']; rank: number | null }>()
for (const circle of currentLeader?.circles ?? []) {
  for (const member of circle.members) {
    placeBefore.set(member.userId, { bookId: circle.bookId, interest: member.interest, rank: member.rank })
  }
}
```

В `buildMoveImpact` обновить сборку beneficiaries:

```typescript
const beneficiaries = moveCircle.members
  .filter((member) => member.userId !== viewingUserId)
  .map((member) => {
    const prev = placeBefore.get(member.userId)
    const before = prev
      ? {
          place: 'circle' as const,
          bookTitle: bookTitleById.get(prev.bookId) ?? prev.bookId,
          interest: prev.interest,
          rankBefore: prev.rank,
        }
      : { place: 'leftOut' as const }
    return {
      userId: member.userId,
      pseudonym: member.pseudonym,
      before,
      after: member.interest,
      afterRank: member.rank,
    }
  })
  .filter((beneficiary) => (
    beneficiary.before.place === 'leftOut' ||
    INTEREST_TIER[beneficiary.after] > INTEREST_TIER[beneficiary.before.interest]
  ))
```

- [ ] **Step 4.4: Запустить тесты — убедиться, что новый проходит**

```bash
npx jest lib/matching/__tests__/move-impact.test.ts --no-coverage
```

Ожидаем: все тесты `PASS` включая новый.

- [ ] **Step 4.5: Commit**

```bash
git add lib/matching/my-moves.ts lib/matching/move-impact.ts lib/matching/__tests__/move-impact.test.ts
git commit -m "feat(matching): rankBefore/afterRank в beneficiary для satisfaction why-text"
```

---

## Task 5: Новый критерий отбора ходов в satisfaction

**Files:**
- Modify: `lib/matching/move-impact.ts`
- Modify: `lib/matching/__tests__/move-impact.test.ts`

Цель: показывать ходы, которые улучшают расклад для *кого угодно* (не только зрителя).

- [ ] **Step 5.1: Написать падающий тест на альтруистичный ход**

Добавить в `lib/matching/__tests__/move-impact.test.ts` (в конец satisfaction-блока из Task 4):

```typescript
  it('shows altruistic move: viewer rank unchanged, but Барсук improves 20→1', () => {
    const currentLeader = makeLeader([{
      id: 'old',
      bookId: 'old',
      minSize: 3, maxSize: 3,
      wantsCount: 1, avgRank: 10, worstRank: 20, unrankedCount: 0,
      members: [
        { userId: 'viewer', pseudonym: 'Нарвал', rank: 3, interest: 'очень хочу' },
        { userId: 'u2', pseudonym: 'Барсук', rank: 20, interest: 'хочу' },
      ],
    }])
    const nextLeader: MatchingScenario = {
      id: 'after',
      tier: 'leader',
      score: {
        coveredCount: 3, totalCount: 5, coverageRatio: 0.6,
        strongInterestCount: 2, rankedCount: 3, unrankedCount: 0,
        rankSum: 4, avgRank: 2, worstRank: 3,
      },
      leftOut: [],
      circles: [{
        id: 'new',
        bookId: 'new',
        minSize: 3, maxSize: 3,
        wantsCount: 2, avgRank: 2, worstRank: 3, unrankedCount: 0,
        members: [
          { userId: 'viewer', pseudonym: 'Нарвал', rank: 3, interest: 'очень хочу' },
          { userId: 'u2', pseudonym: 'Барсук', rank: 1, interest: 'очень хочу' },
        ],
      }],
    }

    const impact = buildMoveImpact({
      move: { ...move('New'), bookId: 'new' },
      scenario: nextLeader,
      currentLeader,
      viewingUserId: 'viewer',
      bookTitleById: new Map([['old', 'Старая'], ['new', 'Новая']]),
      mode: 'satisfaction',
    })

    // viewer rank is still 3→3, but Барсук goes 20→1 → must show
    expect(impact).not.toBeNull()
    const barsuk = impact!.beneficiaries.find(b => b.pseudonym === 'Барсук')
    expect(barsuk?.afterRank).toBe(1)
  })

  it('hides move where viewer rank unchanged and no other rank improves', () => {
    const currentLeader = makeLeader([{
      id: 'old',
      bookId: 'old',
      minSize: 3, maxSize: 3,
      wantsCount: 1, avgRank: 3, worstRank: 3, unrankedCount: 0,
      members: [
        { userId: 'viewer', pseudonym: 'Нарвал', rank: 3, interest: 'очень хочу' },
        { userId: 'u2', pseudonym: 'Барсук', rank: 3, interest: 'очень хочу' },
      ],
    }])
    const nextLeader: MatchingScenario = {
      id: 'after',
      tier: 'leader',
      score: {
        coveredCount: 3, totalCount: 5, coverageRatio: 0.6,
        strongInterestCount: 2, rankedCount: 3, unrankedCount: 0,
        rankSum: 6, avgRank: 3, worstRank: 3,
      },
      leftOut: [],
      circles: [{
        id: 'new',
        bookId: 'new',
        minSize: 3, maxSize: 3,
        wantsCount: 2, avgRank: 3, worstRank: 3, unrankedCount: 0,
        members: [
          { userId: 'viewer', pseudonym: 'Нарвал', rank: 3, interest: 'очень хочу' },
          { userId: 'u2', pseudonym: 'Барсук', rank: 3, interest: 'очень хочу' },
        ],
      }],
    }

    const impact = buildMoveImpact({
      move: { ...move('New'), bookId: 'new' },
      scenario: nextLeader,
      currentLeader,
      viewingUserId: 'viewer',
      bookTitleById: new Map([['old', 'Старая'], ['new', 'Новая']]),
      mode: 'satisfaction',
    })

    expect(impact).toBeNull()
  })
```

- [ ] **Step 5.2: Запустить тест — убедиться, что альтруистичный ход не находится (тест красный)**

```bash
npx jest lib/matching/__tests__/move-impact.test.ts --no-coverage -t "altruistic"
```

Ожидаем: `FAIL` — `expect(impact).not.toBeNull()` не выполняется.

- [ ] **Step 5.3: Обновить satisfaction-фильтр beneficiary и критерий отбора**

В `lib/matching/move-impact.ts` заменить фильтр beneficiary (строка с `INTEREST_TIER`) на ранговый:

```typescript
// Было:
.filter((beneficiary) => (
  beneficiary.before.place === 'leftOut' ||
  INTEREST_TIER[beneficiary.after] > INTEREST_TIER[beneficiary.before.interest]
))

// Стало — для satisfaction используем числовой ранг, для coverage оставляем tier:
// (фильтр теперь внутри buildMoveImpact, который уже знает mode через параметр)
```

Так как `buildMoveImpact` получает `mode` — разделить фильтрацию beneficiary:

```typescript
const beneficiaries = moveCircle.members
  .filter((member) => member.userId !== viewingUserId)
  .map((member) => {
    const prev = placeBefore.get(member.userId)
    const before = prev
      ? {
          place: 'circle' as const,
          bookTitle: bookTitleById.get(prev.bookId) ?? prev.bookId,
          interest: prev.interest,
          rankBefore: prev.rank,
        }
      : { place: 'leftOut' as const }
    return {
      userId: member.userId,
      pseudonym: member.pseudonym,
      before,
      after: member.interest,
      afterRank: member.rank,
    }
  })
  .filter((beneficiary) => {
    if (beneficiary.before.place === 'leftOut') return true
    if (mode === 'satisfaction') {
      // числовой ранг: меньше = лучше; null = без ранга (не улучшение)
      const rankBefore = beneficiary.before.rankBefore
      const rankAfter = beneficiary.afterRank
      return rankBefore !== null && rankAfter !== null && rankAfter < rankBefore
    }
    return INTEREST_TIER[beneficiary.after] > INTEREST_TIER[beneficiary.before.interest]
  })
```

Обновить satisfaction-ветку критерия показа хода:

```typescript
if (mode === 'satisfaction') {
  const wasLeftOut = viewerBeforeRank === null && !viewerBeforePlace
  const improvedRank = viewerAfter !== null && viewerBeforeRank !== null && viewerAfter < viewerBeforeRank
  const hasSatisfactionBeneficiary = beneficiaries.length > 0
  if (!wasLeftOut && !improvedRank && !hasSatisfactionBeneficiary) return null
```

- [ ] **Step 5.4: Запустить все тесты move-impact**

```bash
npx jest lib/matching/__tests__/move-impact.test.ts --no-coverage
```

Ожидаем: все тесты `PASS`.

- [ ] **Step 5.5: Commit**

```bash
git add lib/matching/move-impact.ts lib/matching/__tests__/move-impact.test.ts
git commit -m "feat(matching): satisfaction — показывать альтруистичные ходы (улучшают расклад других)"
```

---

## Task 6: Обновить сортировку для satisfaction

**Files:**
- Modify: `lib/matching/move-impact.ts`
- Modify: `lib/matching/__tests__/move-impact.test.ts`

- [ ] **Step 6.1: Написать падающий тест на сортировку**

Добавить в конец файла `lib/matching/__tests__/move-impact.test.ts`:

```typescript
describe('sortMovesByImpact — satisfaction', () => {
  function satMove(title: string, viewerRankGain: number | null, bestBeneficiaryGain: number): MyMoveBook {
    const before = viewerRankGain !== null ? 10 : null
    const after = viewerRankGain !== null ? 10 - viewerRankGain : null
    return move(title, {
      scenarioId: 's',
      scenarioTitle: 'Сценарий 1',
      coverageLabel: '',
      summary: '',
      circleTitles: [],
      circleBooks: [],
      previewScenario,
      coverage: { before: 3, after: 3 },
      strongInterest: { before: 1, after: 1 },
      satisfaction: { before, after },
      beneficiaries: bestBeneficiaryGain > 0
        ? [{
            userId: 'u1',
            pseudonym: 'Тест',
            before: { place: 'circle', bookTitle: 'Старая', interest: 'хочу', rankBefore: 10 },
            after: 'хочу',
            afterRank: 10 - bestBeneficiaryGain,
          }]
        : [],
    })
  }

  it('sorts by best rank gain (beneficiary or viewer), descending', () => {
    const moves = [
      satMove('Гамма', 2, 0),       // viewer +2, no beneficiary
      satMove('Альфа', null, 15),    // altruistic: beneficiary +15
      satMove('Бета', 5, 3),         // viewer +5, beneficiary +3
    ]
    const sorted = sortMovesByImpact(moves, 'satisfaction')
    expect(sorted.map(m => m.title)).toEqual(['Альфа', 'Бета', 'Гамма'])
  })
})
```

- [ ] **Step 6.2: Запустить тест — убедиться, что падает**

```bash
npx jest lib/matching/__tests__/move-impact.test.ts --no-coverage -t "sortMovesByImpact"
```

- [ ] **Step 6.3: Обновить `sortMovesByImpact` в satisfaction**

В `lib/matching/move-impact.ts`:

```typescript
export function sortMovesByImpact<T extends Pick<MyMoveBook, 'title' | 'impact'>>(moves: T[], mode: OptimizationMode = 'coverage'): T[] {
  if (mode === 'satisfaction') {
    const bestGain = (move: T): number => {
      const satisfaction = move.impact?.satisfaction
      const viewerGain = (() => {
        if (!satisfaction) return -Infinity
        if (satisfaction.before === null && satisfaction.after !== null) return Number.MAX_SAFE_INTEGER
        if (satisfaction.before === null || satisfaction.after === null) return -Infinity
        return satisfaction.before - satisfaction.after
      })()

      const beneficiaryGain = (move.impact?.beneficiaries ?? [])
        .reduce((max, b) => {
          if (b.before.place === 'leftOut') return Math.max(max, Number.MAX_SAFE_INTEGER / 2)
          const rankBefore = b.before.rankBefore ?? null
          const rankAfter = b.afterRank ?? null
          if (rankBefore === null || rankAfter === null) return max
          return Math.max(max, rankBefore - rankAfter)
        }, -Infinity)

      return Math.max(viewerGain, beneficiaryGain)
    }

    return [...moves].sort((a, b) => bestGain(b) - bestGain(a) || a.title.localeCompare(b.title, 'ru'))
  }

  // coverage mode — unchanged
  return [...moves].sort((a, b) => {
    const coverageGainA = impactCoverageGain(a)
    const coverageGainB = impactCoverageGain(b)
    if (coverageGainA !== coverageGainB) return coverageGainB - coverageGainA

    const strongGainA = impactStrongInterestGain(a)
    const strongGainB = impactStrongInterestGain(b)
    if (strongGainA !== strongGainB) return strongGainB - strongGainA

    return a.title.localeCompare(b.title, 'ru')
  })
}
```

- [ ] **Step 6.4: Запустить все тесты**

```bash
npx jest lib/matching/__tests__/move-impact.test.ts --no-coverage
```

Ожидаем: все `PASS`.

- [ ] **Step 6.5: Commit**

```bash
git add lib/matching/move-impact.ts lib/matching/__tests__/move-impact.test.ts
git commit -m "feat(matching): satisfaction сортировка по лучшему рангу (beneficiary или зритель)"
```

---

## Task 7: Новый копирайтинг — пилюля и why-text

**Files:**
- Modify: `components/nd/MatchingMyMoves.tsx`

- [ ] **Step 7.1: Обновить `ImpactMetricPills` (satisfaction-ветка)**

В `components/nd/MatchingMyMoves.tsx` добавить импорт и заменить satisfaction-ветку `ImpactMetricPills`:

```typescript
import { declinePseudonym } from '@/lib/matching/pseudonym-declension'
```

```typescript
function ImpactMetricPills({ move, mode }: { move: MyMoveBook; mode: OptimizationMode }) {
  const coverageGain = impactCoverageGain(move)
  const strongInterestGain = impactStrongInterestGain(move)
  const satisfaction = move.impact?.satisfaction

  if (mode === 'satisfaction') {
    const beneficiaries = move.impact?.beneficiaries ?? []
    const viewerImproved = satisfaction && satisfaction.before !== null
      && satisfaction.after !== null && satisfaction.after < satisfaction.before
    const viewerJoins = satisfaction?.before === null && satisfaction?.after !== null

    // Кто-то выходит из-за борта → «соберётся круг»
    const joinsCircle = beneficiaries.some(b => b.before.place === 'leftOut') || viewerJoins
    if (joinsCircle) {
      return (
        <div className="nd-move-metrics">
          <span className="nd-move-metric nd-move-metric-gain">соберётся круг</span>
        </div>
      )
    }

    // Beneficiary с улучшением ранга (не зритель)
    const improved = beneficiaries.filter(b =>
      b.before.place === 'circle' &&
      b.before.rankBefore !== null && b.afterRank !== null && b.afterRank < b.before.rankBefore
    )

    if (improved.length > 0) {
      const pills = improved.slice(0, 2).map(b => `${declinePseudonym(b.pseudonym, 'dat')} — интереснее`)
      const label = improved.length > 2
        ? `${pills.join(', ')} и ещё ${improved.length - 2}`
        : pills.join(', ')
      return (
        <div className="nd-move-metrics">
          <span className="nd-move-metric nd-move-metric-gain">{label}</span>
          {viewerImproved && <span className="nd-move-metric nd-move-metric-gain">тебе — тоже</span>}
        </div>
      )
    }

    if (viewerImproved) {
      return (
        <div className="nd-move-metrics">
          <span className="nd-move-metric nd-move-metric-gain">тебе — интереснее</span>
        </div>
      )
    }

    return (
      <div className="nd-move-metrics">
        <span className="nd-move-metric nd-move-metric-keep">интересы ближе</span>
      </div>
    )
  }

  // coverage mode — unchanged
  return (
    <div className="nd-move-metrics">
      {coverageGain > 0 ? (
        <span className="nd-move-metric nd-move-metric-gain">↑ Покрытие {move.impact!.coverage.before}→{move.impact!.coverage.after}</span>
      ) : (
        <span className="nd-move-metric nd-move-metric-keep">Покрытие сохранится</span>
      )}
      {strongInterestGain > 0 ? (
        <span className="nd-move-metric nd-move-metric-gain">↑ +{strongInterestGain} «очень хочу»</span>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 7.2: Обновить `MoveWhyText` (satisfaction-ветка)**

Заменить satisfaction-ветку в `MoveWhyText`:

```typescript
function MoveWhyText({ move, mode }: { move: MyMoveBook; mode: OptimizationMode }) {
  const beneficiaries = move.impact?.beneficiaries ?? []
  const leftOut = beneficiaries.filter((b) => b.before.place === 'leftOut')
  const upgraded = beneficiaries.filter((b) => b.before.place === 'circle')
  const strong = beneficiaries.filter((b) => b.after === 'очень хочу')
  const strongInterestVerb = strong.length === 1 ? 'хочет' : 'хотят'

  if (mode === 'satisfaction') {
    const satisfaction = move.impact?.satisfaction
    const viewerJoins = satisfaction?.before === null && satisfaction?.after !== null

    if (viewerJoins && leftOut.length === 0 && upgraded.length === 0) {
      return <>Добавишь — и вы соберётесь в круг, где интересы совпадают лучше.</>
    }

    // Участники с числовым улучшением ранга
    const rankImproved = upgraded.filter(b =>
      b.before.rankBefore !== null && b.afterRank !== null && b.afterRank < b.before.rankBefore
    )

    if (rankImproved.length > 0) {
      return (
        <>
          {rankImproved.map((b, i) => {
            const rBefore = b.before.rankBefore!
            const rAfter = b.afterRank!
            return (
              <span key={b.userId}>
                {i > 0 && ' '}
                <b>{b.pseudonym}</b>
                {` ставит твою книгу на ${rAfter}-е место, а книгу нынешнего круга — на ${rBefore}-е.`}
                {i < rankImproved.length - 1 && ' '}
              </span>
            )
          })}
          {' '}Соберётесь вокруг неё — расклад станет интереснее.
        </>
      )
    }

    if (leftOut.length > 0) {
      return (
        <>
          {renderNames(leftOut.map((b) => b.pseudonym))}
          {' сейчас без круга — добавишь, и соберётесь вместе.'}
        </>
      )
    }

    return <>Этот ход улучшит расклад — интересы совпадут лучше.</>
  }

  // coverage mode — unchanged
  if (leftOut.length > 0) {
    return (
      <>
        {renderNames(leftOut.map((b) => b.pseudonym))}
        {' сейчас за бортом. Добавишь эту книгу — и вы соберетесь в круг'}
        {strong.length > 0 && (
          <>
            {', где '}
            <em>{joinNamesText(strong.map((b) => b.pseudonym))} очень {strongInterestVerb} читать</em>
          </>
        )}
        {'.'}
      </>
    )
  }

  if (upgraded.length > 0) {
    const interestVerb = upgraded.length === 1 ? 'хочет' : 'хотят'
    return (
      <>
        {renderNames(upgraded.map((b) => b.pseudonym))}
        {` уже в сценарии, но эту книгу ${interestVerb} `}
        <em>сильнее</em>
        {'. Добавишь — соберутся вокруг неё, не потеряв покрытие.'}
      </>
    )
  }

  return <>{'Этот ход увеличит покрытие лучшего сценария.'}</>
}
```

- [ ] **Step 7.3: Запустить typecheck и lint**

```bash
npm run typecheck && npm run lint
```

Ожидаем: 0 ошибок. Если есть — исправить (чаще всего: `b.before.rankBefore` — нужен проверочный type-guard на `b.before.place === 'circle'`).

- [ ] **Step 7.4: Commit**

```bash
git add components/nd/MatchingMyMoves.tsx
git commit -m "feat(matching): satisfaction my-moves — понятные пилюли и why-text (Барсуку станет интереснее)"
```

---

## Task 8: E2E тест

**Files:**
- Modify: `e2e/matching-satisfaction.spec.ts`

- [ ] **Step 8.1: Прочитать `docs/features/testing.md` (обязательно)**

```bash
cat docs/features/testing.md
```

Читать полностью — особенно секции про live-locators, изоляцию от прод-БД и работу с матчинг-фикстурами.

- [ ] **Step 8.2: Открыть текущий `e2e/matching-satisfaction.spec.ts`**

```bash
cat e2e/matching-satisfaction.spec.ts
```

Найти ассерты, которые проверяли старые формулировки («↑ ранг», «интересы совпадают»). Зафиксировать их.

- [ ] **Step 8.3: Обновить ассерты под новые формулировки**

Заменить все совпадения со старыми текстами:
- `'↑ ранг'` → убрать или заменить на поиск нового класса `.nd-move-metric-gain`
- `'интересы ближе'` или `'интересы совпадают лучше'` → `'— интереснее'` или `'соберётся круг'`
- Добавить проверку, что why-text содержит конкретное место («-е место»): `expect(page.locator('.nd-move-why')).toContainText('-е место')`

- [ ] **Step 8.4: Запустить E2E тест изолированно**

```bash
npm run test:e2e e2e/matching-satisfaction.spec.ts
```

Ожидаем: `PASSED`. Если упал — диагностировать по скриншоту/трейсу, поправить.

- [ ] **Step 8.5: Commit**

```bash
git add e2e/matching-satisfaction.spec.ts
git commit -m "test(e2e): satisfaction my-moves — обновить ассерты под новые формулировки"
```

---

## Task 9: Обновить Wiki и открыть PR

**Files:**
- Modify: `docs/wiki/Group-Matching-Mode.md`

- [ ] **Step 9.1: Обновить описание ходов в satisfaction**

В `docs/wiki/Group-Matching-Mode.md` найти секцию о «Моих ходах» / satisfaction-режиме.

Обновить так, чтобы пользователь понял:
- Карточка показывает, кому именно станет интереснее и насколько (конкретные места).
- Теперь показываются и ходы, которые помогают другим, даже если у тебя лично расклад не меняется.

- [ ] **Step 9.2: Commit**

```bash
git add docs/wiki/Group-Matching-Mode.md
git commit -m "docs: satisfaction my-moves — обновить wiki описание ходов"
```

- [ ] **Step 9.3: Финальные проверки перед PR**

```bash
npm run lint && npm run typecheck && npm test
```

Ожидаем: 0 ошибок, все тесты зелёные.

- [ ] **Step 9.4: Открыть PR**

```bash
gh pr create --title "feat(matching): понятные пояснения к ходам в satisfaction-режиме" --body "$(cat <<'EOF'
## Summary
- Карточки «Мои ходы» в satisfaction-режиме теперь показывают конкретные имена и позиции: «Барсуку станет заметно интереснее: твою книгу он ставит на 1-е место, а нынешнюю — на 20-е»
- Показываются альтруистичные ходы — когда расклад улучшается для других, даже если для тебя лично ничего не меняется
- Подключена библиотека склонений `russian-nouns-js` (devDependency), рантайм — статичная таблица `pseudonym-declensions.generated.ts`
- Сортировка ходов теперь учитывает лучший выигрыш ранга среди всех участников (не только зрителя)

## Test plan
- [ ] `npm run lint && npm run typecheck && npm test` — всё зелёное
- [ ] E2E `matching-satisfaction.spec.ts` — пройден
- [ ] Вручную в satisfaction-режиме: карточка показывает имена и места, не «↑ ранг 20→1»
- [ ] Проверить edge-case: ход, где только зритель выигрывает (только «тебе — интереснее»)
- [ ] Проверить edge-case: несколько beneficiary — все имена в пилюле/why-text

Closes #316

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
gh pr merge --auto --squash --delete-branch
```

---

## Ревью плана против спеки

**Покрытие:**
- ✅ Генератор склонений (`russian-nouns-js`, статичная таблица) — Task 2
- ✅ Карта рода + ручные оверрайды — Task 1, Task 3
- ✅ Рантайм API `declinePseudonym`/`pseudonymPronoun` — Task 3
- ✅ `rankBefore`/`afterRank` в beneficiary — Task 4
- ✅ Ранговый фильтр beneficiary (числовой, не tier) — Task 5
- ✅ Альтруистичные ходы — Task 5
- ✅ Новая сортировка — Task 6
- ✅ Новый копирайтинг пилюли и why-text — Task 7
- ✅ E2E обновление — Task 8
- ✅ Wiki — Task 9

**Замечания:**
- `b.before.rankBefore` доступен только когда `b.before.place === 'circle'` — в Task 7 упомянут type-guard в 7.3, TypeScript не пропустит без него.
- Рантайм API использует `PseudonymDeclension` из generated-файла — тип реэкспортируется в `pseudonym-declension.ts`, поэтому users импортируют из одного места.
