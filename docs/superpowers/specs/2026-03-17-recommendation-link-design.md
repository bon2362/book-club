# Ссылка на рекомендацию в карточке книги (Backlog #62)

**Date:** 2026-03-17
**Status:** Approved

## Цель

Дать возможность указывать в Google Sheets внешнюю ссылку на отзыв/рекомендацию книги, которая отображается в карточке книги на сайте под блоком «Почему предлагаю прочитать».

## Структура данных

### Google Sheets

Новый столбец **M** вставляется между WhyForClub (L) и Cover:

| Колонка | Индекс | Поле           |
|---------|--------|----------------|
| L       | 11     | WhyForClub     |
| **M**   | **12** | **RecommendationLink** |
| N       | 13     | Cover          |

Формат ячейки: `"Текст ссылки https://url"` — одна ссылка, текст и URL разделены пробелом перед `https://` или `http://`.
Примеры: `"Отзыв А. Замятина https://t.me/zamyatinsk/88"`

### Парсинг

Формат строго: `"Текст ссылки https://url"` — URL всегда последний элемент, отделён пробелом.

Helper `parseRecommendationLink(raw: string): { text: string; url: string } | null`:
- Находим последний пробел перед `https://` или `http://` через `lastIndexOf`
- Часть до этого пробела (trim) → `text`
- Часть от `https://` до конца → `url`
- Если URL не найден или `text` пуст → возвращает `null`

`parseBookRow` сохраняет **сырую строку** в `recommendationLink` (аналогично `whyForClub`). Парсинг text/url выполняется в компоненте через helper.

## Изменения в коде

### `lib/sheets.ts`

- `COL.COVER`: `12` → `13`
- Добавить `COL.RECOMMENDATION_LINK: 12`
- Диапазон: `'to read!A:M'` → `'to read!A:N'`
- Интерфейс `Book`: добавить поле `recommendationLink: string | null`
- `parseBookRow`: парсить ячейку M, записывать сырую строку в `recommendationLink` (парсинг text/url — в компоненте или helper)
- `TEST_BOOKS`: добавить `recommendationLink: null`

### `lib/books-with-covers.ts`

- Интерфейс `BookWithCover`: добавить `recommendationLink: string | null`
- В маппинге `sheetsBooks`: поле проброшено через spread `{ ...b, whyRead: ..., isNew: ... }` — `recommendationLink` попадёт автоматически т.к. поле есть в `Book`. Явно добавлять не нужно, тип должен совпадать.
- В маппинге `submissionBooks`: явно добавить `recommendationLink: null`

### `components/nd/BookCard.tsx`

- Helper `parseRecommendationLink` определяется **inline в `BookCard.tsx`** (логика чисто UI, не нужна нигде ещё)
- После блока `whyRead`, рендерится ссылка **независимо от `descExpanded`** — отдельный JSX-блок за пределами условия `(!isLongDescription || descExpanded)`
- Условие рендера: `book.recommendationLink && parseRecommendationLink(book.recommendationLink)`
- Если `recommendationLink: null` или парсинг вернул `null` — блок не рендерится (нет пустого состояния)
- Стиль: мелкий шрифт (0.7rem), цвет `#999`, ссылка с `borderBottom: '1px solid #ccc'`, открывается в новой вкладке (`target="_blank" rel="noopener noreferrer"`)
- `BookWithCover.recommendationLink` хранит сырую строку `string | null` (парсинг в компоненте)

## Ограничения

- Только одна ссылка на книгу
- Ссылка из `bookSubmissions` не поддерживается (`recommendationLink: null`)
- Парсинг рассчитан на формат `"Текст https://url"` — URL идёт последним

## Тестирование

- Существующие E2E и unit тесты не ломаются (`TEST_BOOKS` получает `recommendationLink: null`, никаких изменений в тестах не нужно)
- Новые E2E тесты для этой фичи не пишем — охват ручным тестированием достаточен
- Ручная проверка: добавить тестовую запись в колонку M Sheets, убедиться что ссылка отображается корректно под блоком «Почему предлагаю прочитать»
