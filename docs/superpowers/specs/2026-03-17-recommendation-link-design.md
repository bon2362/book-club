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

Regex: `/(https?:\/\/\S+)/`
- Часть до URL (trim) → текст ссылки (`linkText`)
- URL → `href`
- Если ячейка пуста или не содержит URL → `recommendationLink: null`

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
- В маппинге `sheetsBooks`: пробросить `recommendationLink: b.recommendationLink ?? null`
- В маппинге `submissionBooks`: добавить `recommendationLink: null`

### `components/nd/BookCard.tsx`

- После блока `whyRead`, добавить рендер ссылки если `book.recommendationLink` задан
- Парсинг: helper-функция `parseRecommendationLink(raw: string): { text: string; url: string } | null`
- Отображение: строка под `whyRead`-блоком, стиль — мелкий шрифт (0.7rem), цвет `#999`, ссылка с `borderBottom: '1px solid #999'`, открывается в новой вкладке (`target="_blank" rel="noopener noreferrer"`)
- Видна всегда (не зависит от `descExpanded`)

## Ограничения

- Только одна ссылка на книгу
- Ссылка из `bookSubmissions` не поддерживается (`recommendationLink: null`)
- Парсинг рассчитан на формат `"Текст https://url"` — URL идёт последним

## Тестирование

- Существующие E2E и unit тесты не ломаются (`TEST_BOOKS` получает `recommendationLink: null`)
- Ручная проверка: добавить тестовую запись в колонку M Sheets, убедиться что ссылка отображается корректно
