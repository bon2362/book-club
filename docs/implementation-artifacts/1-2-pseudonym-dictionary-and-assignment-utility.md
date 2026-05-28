# Story 1.2: Pseudonym dictionary and assignment utility

Status: in-progress

## Story

As a разработчик,
I want файл `lib/matching/pseudonyms.ts` с массивом ANIMALS (≥200 слов) и функцией `assignPseudonym`,
so that истории 1-3 и 1-4 могли назначать уникальные псевдонимы без дублирования логики.

## Acceptance Criteria

1. Файл `lib/matching/pseudonyms.ts` экспортирует `ANIMALS: readonly string[]` из ≥200 уникальных русских слов-животных.
2. Экспортирует класс `PseudonymExhaustedError extends Error`.
3. Экспортирует чистую функцию `assignPseudonym(takenSet: ReadonlySet<string>): string`, возвращающую случайное животное не из `takenSet`.
4. Unit-тест: 30 последовательных назначений на накапливаемом множестве — все уникальны, все из ANIMALS.
5. Unit-тест: при `takenSet` = все слова из ANIMALS функция бросает `PseudonymExhaustedError`.
6. `npm run typecheck` и `npm run lint` проходят.
7. `npm test` проходит без регрессий.

## Tasks / Subtasks

- [x] Создать `lib/matching/pseudonyms.ts` с ANIMALS (≥200 слов), PseudonymExhaustedError, assignPseudonym (AC: 1, 2, 3)
- [x] Написать unit-тест `lib/matching/__tests__/pseudonyms.test.ts` (AC: 4, 5)
- [x] Запустить `npm test` и убедиться что всё проходит (AC: 7)
- [x] Запустить `npm run typecheck && npm run lint` (AC: 6)

## Dev Notes

### Паттерн файлов модуля

Новая папка `lib/matching/` — корневой модуль всей Group Matching фичи. Создаётся в этой истории.
Тесты в `lib/matching/__tests__/`.

### assignPseudonym алгоритм

Fisher-Yates shuffle не нужен. Достаточно: отфильтровать ANIMALS \ takenSet, взять случайный индекс.
При пустом остатке — бросить `PseudonymExhaustedError`.

### ANIMALS словарь

Минимум 200 уникальных русских одиночных слов, одушевлённые существительные (животные, птицы, рыбы, насекомые).
Примеры: Барсук, Выдра, Лис, Рысь, Бобр, Енот, Куница, Соболь, Норка, Горностай, Хорь, Ласка...

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

- Создан lib/matching/pseudonyms.ts (220 животных)
- Тесты в lib/matching/__tests__/pseudonyms.test.ts
- Все тесты проходят

### File List

- lib/matching/pseudonyms.ts
- lib/matching/__tests__/pseudonyms.test.ts
