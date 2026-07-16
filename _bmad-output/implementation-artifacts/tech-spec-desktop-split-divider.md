---
title: 'Добавить разделитель desktop split-кнопке Matching'
type: 'bugfix'
created: '2026-07-16'
status: 'done'
---

# Добавить разделитель desktop split-кнопке Matching

<frozen-after-approval reason="direct user request">

## Intent

На desktop визуально разделить основное действие «Записаться» и стрелку раскрытия авто-записи так же ясно, как на mobile. Не менять тексты, размеры, меню или бизнес-логику.

## Acceptance

- Given desktop Matching с доступной авто-записью, when отображается split-кнопка, then перед стрелкой видна вертикальная линия из существующего дизайн-токена.
- Given mobile Matching, then существующая геометрия и поведение split-кнопки не меняются.

</frozen-after-approval>

## Tasks

- [x] `app/globals.css` — задать desktop-only цвет левой границы caret.
- [x] `e2e/matching-layout.spec.ts` — дополнить существующий desktop/mobile golden проверкой desktop-разделителя.
- [x] Прогнать lint, typecheck и focused layout E2E.
