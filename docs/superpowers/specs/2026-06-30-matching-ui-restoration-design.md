# Matching UI Restoration Design

**Дата:** 2026-06-30  
**Статус:** утверждён  
**Базовая спецификация:** `docs/superpowers/specs/2026-06-29-matching-simplified-design.md`

## 1. Цель

Восстановить информационную полноту и high-fidelity композицию страницы `/matching`, случайно потерянные при переходе на упрощённый satisfaction matching, не возвращая удалённый legacy runtime.

Новое доменное ядро остаётся источником истины для подтверждений, автоматических переносов, закрепления кругов, observer-mode, dissolve и freeze. Восстанавливается только пользовательская оболочка и безопасный read-model, необходимый ей.

## 2. Источник истины и приоритет решений

Визуальным источником истины служит handoff `design_handoff_matching_simplified`, особенно `README.md`, `Board.jsx`, `Scenarios.jsx` и `Welcome.jsx`.

Более поздние продуктовые решения имеют приоритет:

- matching содержит только satisfaction;
- реальные глобальные имена вместо псевдонимов;
- нет coverage, mode selector, «Моих ходов» и пользовательской ленты;
- первый сценарий не выделяется как лучший;
- нет Telegram CTA;
- Ranking Gate сохраняется;
- подтверждение временно до полного кворума;
- observer остаётся на странице, но исключается из расчётов;
- admin dissolve возвращает весь круг целиком.

## 3. Подход

Используется гибридный подход:

1. Новая транзакционная модель matching и её API сохраняются.
2. Оболочка доски восстанавливается по структуре legacy-компонентов, но переписывается на реальные имена и opaque refs.
3. Карточки сценариев реализуются по high-fidelity handoff.
4. Public read-model расширяется презентационными данными, которые генератор уже вычисляет, но текущий адаптер отбрасывает.

Прямое восстановление старых компонентов из git-тега запрещено: они завязаны на pseudonym, coverage, feed и My Moves. Git-тег используется только как справочник сохранённого поведения.

## 4. Шапка

Новая `MatchingHeader` содержит:

- ссылку `← Каталог`;
- название сессии;
- размер групп;
- дедлайн;
- active/frozen status;
- `Вы — <Имя>` для active viewer;
- badge `Вы наблюдаете` для observer;
- кластер участников, счётчик и поповер полного состава;
- online-индикаторы по heartbeat public refs;
- действие `Покинуть` для active viewer;
- admin impersonation banner и возврат из impersonation;
- редактирование размера групп администратором в active-сессии.

Feed ticker, optimization mode и mode switch отсутствуют.

## 5. Workspace

Доска снова собирается через один `MatchingSatisfactionFlow`:

```text
MatchingHeader
└── MatchingWorkspace (до 90svh)
    └── Scenarios panel (внутренний scroll + fade)
Catalog / Мои книги
```

Текущий параллельный рендер `MatchingRealtimeClient` и пустого board-slot удаляется. Это устраняет пустой блок `90svh` перед каталогом.

`MatchingWorkspace` использует `MatchingBoardProvider.pending`: после изменения книг или приоритетов сценарии приглушаются и показывают индикатор пересчёта до получения новой версии.

## 6. Сценарии и круги

Все сценарии оформлены одинаково. Порядок остаётся алгоритмическим, но UI не показывает leader tier.

Карточка сценария содержит:

- номер;
- средний ранг;
- количество кругов;
- охват `N из M`;
- список оставшихся за бортом.

Круги располагаются сеткой до трёх колонок. Карточка круга содержит:

- `CoverImage`;
- кликабельное название и автора;
- количество участников;
- `ParticipantInterestChip` для каждого участника с rank/interest;
- confirmation status `✓` или `○`;
- CTA только если viewer входит в круг.

Клик по обложке или названию открывает существующий общий `BookDetailProvider`. Отдельный книжный modal для сценариев не создаётся.

На desktop CTA скрыта до hover/focus-within, на touch видна постоянно. `prefers-reduced-motion` отключает transform-анимацию.

## 7. Confirmation и observer

Provisional confirmation оформляется терракотовым accent, а не success-green:

- `Вы выбрали этот круг`;
- прогресс `N из M`;
- пояснение `временно, ждём остальных`;
- действие `Отменить`.

Success-green используется только после закрепления.

Observer видит:

1. Собственный круг как основной результат с обложкой, автором, составом и объяснением observer-mode.
2. Общий реестр остальных закреплённых кругов.
3. Живые сценарии оставшихся участников без мутирующих CTA.

## 8. Public state и безопасность

Обычный participant DTO использует только `publicRef`. Raw `userId` не попадает ни в JSON API, ни в React Server Components payload.

Public state дополняется:

- `session.deadlineAt`, min/max group size;
- полным списком участников с display name, online и confirmation status;
- presentation-полями сценария: score, left-out;
- presentation-полями круга: avg rank, member rank/interest;
- безопасным frozen snapshot.

Внутренняя reconciliation-модель остаётся минимальной и не смешивается с presentation DTO.

Durable notices хранят снимки отображаемых имён прежнего и нового состава. Notice не должен зависеть от того, остаётся ли участник в сессии.

## 9. Журналы и конкурентность

- Идентичный повтор confirmation с устаревшей версией возвращает уже достигнутое состояние.
- Welcome name change получает отдельное semantic event с before/after.
- Dissolve event содержит книгу, состав и причину.
- Heartbeat остаётся исключённым из audit log как operational telemetry.

## 10. Тестовая стратегия

Component и unit tests проверяют преобразования данных, состояния компонентов и отсутствие raw IDs.

E2E проверяют законченные пользовательские истории:

1. Welcome → имя → Ranking Gate → ranking → board → reload.
2. Шапка, participant popover, online, возврат в каталог и leave/rejoin.
3. Обложка и книжный popup из сценария.
4. Метрики сценария и нейтральное оформление ранга.
5. Confirm/cancel/switch с reload и вторым пользователем.
6. Automatic transfer/invalidation и durable notice.
7. Lock → observer → исключение из следующего расчёта.
8. Admin add/remove/dissolve/freeze.
9. Matching analytics, global audit и отсутствие heartbeat noise.
10. First-commit concurrency и идемпотентный retry.

Layout E2E являются вторичным слоем и проверяют hover/focus/touch CTA, внутренний scroll, отсутствие пустого `90svh`, положение locked registry и стабильность observer layout.

## 11. Критерии готовности

- Восстановлены все элементы шапки, кроме явно удалённых feed/mode controls.
- Сценарии снова содержат обложки, popup, метрики, left-out и ранги участников.
- Нет raw user IDs в participant surfaces.
- Provisional и locked визуально и семантически различимы.
- Observer видит собственный круг как основной результат.
- Все перечисленные E2E проходят на изолированной Neon e2e-ветке и проверяют persistence через reload.
- Runtime scan не находит coverage, pseudonym, My Moves или feed.

