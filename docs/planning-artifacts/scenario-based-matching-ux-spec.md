# Scenario-Based Matching UX

## Purpose

Пересобрать matching UI вокруг сценариев распределения, а не отдельных кругов.

Сейчас пользователь видит текущие читательские круги и персональные ходы как две похожие секции. Это плохо объясняет, зачем менять предпочтения, если уже есть рабочий расклад. Новая модель должна показать:

- какие сценарии уже складываются из текущих предпочтений;
- кто попадает в круги и кто остаётся за бортом в каждом сценарии;
- какие персональные действия текущего пользователя могут открыть лучший сценарий;
- как меняется качество распределения после такого действия.

## Core Concepts

### Circle

Один читательский круг внутри сценария.

```ts
interface MatchingCircle {
  bookId: string
  members: GroupMember[]
  minSize: number
  maxSize: number
  status: 'formed' | 'expandable' | 'full'
}
```

Правила:

- круг считается собранным, когда `members.length >= minSize`;
- круг может расширяться, пока `members.length < maxSize`;
- один участник может входить только в один круг внутри одного сценария;
- одна книга должна появляться в сценарии не более одного раза.

### Scenario

Полный вариант распределения участников.

```ts
interface MatchingScenario {
  id: string
  circles: MatchingCircle[]
  leftOut: ScenarioParticipant[]
  coveredCount: number
  totalCount: number
  score: ScenarioScore
  tier: 'leader' | 'full-coverage' | 'partial' | 'blocked-better'
}
```

Сценарий может содержать один или несколько кругов. Сценарий может покрывать всех участников или только часть.

Примеры:

- `2 круга · 6/6 участни:ц` — полный сценарий;
- `1 круг · 3/6 участни:ц` — частичный сценарий;
- `3 круга · 11/13 участни:ц` — лучший достижимый частичный сценарий.

### Personal Move

Персональная возможность текущего пользователя повлиять на распределение.

```ts
interface PersonalScenarioMove {
  id: string
  action: PersonalMoveAction
  unlocksScenario: MatchingScenario
  improvesOverScenarioId: string | null
  impact: PersonalMoveImpact
}
```

Действие может быть:

- добавить книгу в список;
- поднять книгу выше в ранге;
- снять personal status `reading` / `read`;
- возможно позже: убрать книгу, если она мешает лучшему раскладу.

В UI показываются только действия текущего пользователя. Возможности других участников не показываются, чтобы не создавать шум.

## UX Model

### Section: Читательские круги

Назначение: показать общие сценарии, которые уже складываются при текущих предпочтениях.

Секция отвечает на вопрос:

> Что уже возможно сейчас?

Структура:

```text
Читательские круги
Сценарии, которые уже складываются

[Сценарий A · полный охват]
2 круга · 6/6 участни:ц

Моя любимая страна
Мария · Ваня · Евгений

Патриот
Артём · Юлия · Александр

[Сценарий B · сильнее по желаниям, но неполный]
1 круг · 3/6 участни:ц

Краткая история неолиберализма
Артём · Александр · Евгений

За бортом:
Мария · Юлия · Ваня
```

Карточка сценария должна показывать:

- бейдж качества: `полный охват`, `частичный`, `лучше по желаниям`, `можно улучшить`;
- количество кругов;
- покрытие `coveredCount / totalCount`;
- круги внутри сценария;
- участников за бортом, если они есть;
- короткое пояснение для неполного, но сильного сценария:
  - `Нужен второй круг, чтобы никто не остался за бортом.`

### Section: Мои ходы

Назначение: показать персональные альтернативные версии развития событий.

Секция отвечает на вопрос:

> Что могу изменить именно я?

Структура:

```text
Мои ходы
Что может измениться благодаря тебе

[Добавь "Консенсус"]
Откроется лучший сценарий

После твоего хода:

Консенсус
Мария · Юлия · Ваня

Краткая история неолиберализма
Артём · Александр · Евгений

Что изменится:
6/6 участни:ц в кругах
Артём, Александр и Евгений получают более желанную книгу
```

Если несколько действий текущего пользователя открывают один и тот же сценарий, они группируются в одной карточке:

```text
Открыть этот сценарий можно:
+ Консенсус
+ Другая книга
+ Поднять "Консенсус" выше
```

Не показывать:

- действия других участников;
- действия, которые создают только слабый сценарий ниже текущего лидера;
- полный перебор всех возможных комбинаций;
- сложные числовые score-метрики без явной пользы.

### Hover / Focus Highlighting

Не подсвечивать целые карточки сценариев в `Читательских кругах` при наведении на `Мои ходы`: на реальных данных это слишком часто подсвечивает почти весь список и не помогает принять решение.

Допустима точечная подсветка **бенефициаров хода** в текущем лидер-сценарии: конкретных чипов участников или имён в строке «За бортом». Связь хода со сценарием должна объясняться внутри самой карточки хода, а подсветка должна только подтверждать, кому именно поможет действие.

## Ranking Model

Ranking должен выбирать лучший **сценарий распределения**, а не лучший отдельный круг. Это важно: сильный круг по одной книге не должен побеждать, если из-за него меньше участников попадут в какие-либо круги.

Главный принцип:

> Сначала максимизируем вовлечение участников, затем оптимизируем качество предпочтений внутри сценариев с одинаковым покрытием.

### Scenario Metrics

Для каждого сценария считаются агрегированные метрики:

```ts
interface ScenarioScore {
  coveredCount: number
  totalCount: number
  coverageRatio: number
  strongInterestCount: number
  rankedCount: number
  unrankedCount: number
  rankSum: number
  avgRank: number | null
  worstRank: number | null
}
```

Определения:

- `coveredCount` — количество уникальных участников, попавших в любой круг сценария.
- `coverageRatio` — `coveredCount / totalCount`.
- `strongInterestCount` — сколько участников в сценарии получили книгу из сильных личных предпочтений. В текущей модели это `rank <= 3`.
- `rankSum` — сумма персональных рангов выбранных книг для участников с выставленным рангом.
- `avgRank` — средний ранг среди участников с ранжированной книгой. Меньше = лучше.
- `worstRank` — худший ранг внутри сценария. Меньше = справедливее.
- `unrankedCount` — сколько участников попали в круг по книге без персонального ранга. Такие участники допустимы, но при равных условиях сценарий с меньшим `unrankedCount` лучше.

Важно про язык: в UI и документации лучше говорить не “книги с наибольшим рейтингом”, а “книги с более высоким личным приоритетом”, потому что технически меньший `rank` означает более сильное желание.

### Lexicographic Sorting

Сценарии сортируются строго лексикографически:

1. Больше покрытие участников: `coveredCount DESC`.
2. Больше участников получают книги из сильных предпочтений: `strongInterestCount DESC`.
3. Ниже средний ранг выбранных книг: `avgRank ASC`, где `null` считается хуже любого числа.
4. Ниже худший ранг внутри сценария: `worstRank ASC`, где `null` считается хуже любого числа.
5. Меньше участников без ранга: `unrankedCount ASC`.
6. Стабильный tie-breaker по `bookId` / `userId`, чтобы UI не прыгал между равными сценариями.

Следствие:

- сценарий `6/6` всегда выше сценария `5/6`, даже если в сценарии `5/6` средний ранг лучше;
- среди двух сценариев `6/6` побеждает тот, где больше людей получают книги из топ-3;
- если top-3 count равен, побеждает сценарий с меньшим средним рангом;
- если средний ранг равен, побеждает сценарий с меньшим худшим рангом, чтобы не “жертвовать” одним участником ради среднего.

### Coverage Tiers

UI должен различать:

- `leader` — сценарий номер 1 по сортировке; это кандидат на freeze.
- `full-coverage` — сценарий покрывает всех участников: `coveredCount === totalCount`.
- `best-achievable-partial` — сценарий не покрывает всех, но имеет максимальное покрытие среди найденных сценариев.
- `partial` — сценарий с меньшим покрытием.
- `blocked-better` — частичный сценарий с сильными предпочтениями, который может стать частью лучшего полного сценария через персональный ход.

`blocked-better` не означает, что частичный сценарий должен победить полный. Он означает: “этот круг желанный, но ему нужен второй круг, чтобы не оставить людей за бортом”.

Важно: частичный сценарий с сильными желаниями всё равно может показываться ниже полного сценария как `лучше по желаниям, но неполный`, если он объясняет потенциальный персональный ход.

### Personal Move Ranking

Персональные ходы сравнивают **лучший сценарий после действия пользователя** с текущим `leader`. При симуляции добавления книги система считает, что добавляемая книга становится `rank = 1`, а остальные книги пользователя сдвигаются вниз.

Ход показывается только если после симуляции меняется сценарий на первом месте, и новый лидер содержит добавленную пользователем книгу:

1. новый сценарий становится лидером;
2. или существующий сценарий поднимается на первое место.

Если действие создаёт только дополнительный сценарий ниже текущего лидера, оно не показывается в `Моих ходах`, даже если технически замыкает один круг.

Если два действия пользователя ведут к одному и тому же результирующему сценарию, они группируются в одной карточке `Мои ходы`.

### Dynamic Group Size Implications

Сессия хранит `minGroupSize` / `maxGroupSize`; coverage-first правило сохраняется:

- круг считается валидным при `members.length >= minGroupSize`;
- добавление участников до `maxGroupSize` полезно, если увеличивает `coveredCount`;
- при равном покрытии сценарий с более качественными личными приоритетами побеждает сценарий, который просто “набил” круги участниками с низкими или отсутствующими рангами.

Количество кругов само по себе не является целью. Два сценария с одинаковым покрытием сравниваются по качеству предпочтений, а не по тому, где больше или меньше кругов.

### Compatibility Notes / Current Conflict

Текущий `lib/matching/scenarios.ts` ещё не реализует эту модель полностью:

- он оценивает отдельные candidate circles через `wantsCount`, `avgRank`, `worstRank`, `unrankedCount`;
- затем сортирует candidate circles по качеству предпочтений;
- затем жадно выбирает непересекающиеся круги.

Это может пропустить сценарий с лучшим покрытием, если ранний сильный круг блокирует несколько более слабых кругов, которые вместе покрыли бы больше участников.

Для этой спецификации новый engine должен:

1. сначала строить возможные сценарии как наборы непересекающихся кругов;
2. считать `ScenarioScore` на уровне всего сценария;
3. сортировать сценарии coverage-first;
4. только после этого выбирать `leader`, альтернативные сценарии и персональные ходы.

## Dynamic Circle Size

Сессия должна поддерживать диапазон размера круга:

```ts
minGroupSize: number
maxGroupSize: number
```

Не вводим UI-статусы вроде `собран`, `можно расширить`, `полный`: цель не в том, чтобы набить каждый круг до максимума. Диапазон нужен, чтобы сценарий мог покрыть больше людей, например распределением 3+4 вместо жесткого 3+3 с одним участником за бортом.

БД хранит `matching_sessions.min_group_size` и `matching_sessions.max_group_size`. Старое поле `target_group_size` удалено миграцией, для существующей тестовой сессии оба новых значения выставляются в `3`.

## Algorithm Sketch

### Generate Current Scenarios

Input:

- participants;
- published books;
- active signups (`personal_status IS NULL`);
- ranks;
- `minGroupSize`;
- `maxGroupSize`;
- `maxScenarios`.

Steps:

1. Для каждой книги построить кандидатов-участников.
2. Сформировать возможные круги размером от `minGroupSize` до `maxGroupSize`.
3. Оценить каждый круг по рангам и wantsCount.
4. Сформировать сценарии как непересекающиеся наборы кругов.
5. Оценить сценарии по coverage-first ranking.
6. Вернуть top-N сценариев плюс дополнительные сильные частичные сценарии, если они объясняют персональные ходы.

### Generate Personal Moves

Input:

- current user;
- current scenarios;
- catalog books not in user's active list;
- active signups/ranks of all session participants.

For each possible action of current user:

1. Симулировать изменение состояния.
2. Пересчитать сценарии.
3. Найти сценарии, которые:
   - улучшают coverage;
   - или сохраняют coverage, но повышают качество предпочтений;
   - или разблокируют сильный частичный сценарий без ухудшения покрытия.
4. Сгруппировать действия, ведущие к одному или похожему сценарию.
5. Вернуть только действия текущего пользователя.

## Acceptance Criteria

### Scenario Overview

Given active matching session with participants and signups  
When the matching page renders  
Then `Читательские круги` shows scenario cards, where each scenario contains one or more circles and a left-out participant list.

Given one scenario covers all participants and another covers only part of them  
When both scenarios are valid from current preferences  
Then the full-coverage scenario is visually prioritized, and the partial scenario clearly shows `За бортом`.

Given a partial scenario contains a more strongly preferred circle  
When showing that scenario  
Then the UI explains in one short line that another circle is needed so nobody remains left out.

### Personal Moves

Given current user can add a book that opens a better scenario  
When `Мои ходы` renders  
Then the card shows the user action and the resulting scenario, not only the book.

Given multiple user actions open the same resulting scenario  
When `Мои ходы` renders  
Then those actions are grouped in one card.

Given another participant could also unlock a scenario  
When current user views `Мои ходы`  
Then other participant actions are not shown.

Given current user clicks or hovers a personal move  
When the linked scenario is visible in `Читательские круги`  
Then the linked scenario is highlighted and unrelated scenarios are not emphasized.

### Dynamic Size

Given a session has `minGroupSize = 3` and `maxGroupSize = 5`  
When a circle has 3 members  
Then it is considered formed and displayed as `3/5`.

Given a circle has fewer than `minGroupSize` members  
When generating scenarios  
Then it is not treated as a formed circle.

Given admin changes min/max group size after launch  
When matching state is refreshed  
Then scenarios and personal moves recompute using the new bounds.

## Implementation Slices

### Slice 1: Spec-compatible scenario types

Files:

- `lib/matching/scenarios.ts`
- `lib/matching/__tests__/scenarios.test.ts`
- `app/matching/page.tsx`
- `components/nd/MatchingScenarios.tsx`

Actions:

- Introduce `MatchingScenario`, `MatchingCircle`, `ScenarioScore`.
- Keep existing `generateScenarios()` compatibility wrapper for freeze code.
- Render scenario cards as containers of circles.
- Keep group size fixed to configured `minGroupSize`/`maxGroupSize` in this slice.

## Implementation-Ready Task: Slice 1

### Title

Scenario-based matching engine and reader-circle cards.

### Objective

Replace the current circle-first overview with a scenario-first model for `Читательские круги`, while keeping group size fixed to the configured `minGroupSize`/`maxGroupSize`.

This slice must establish the core engine contract:

- a scenario contains one or more circles;
- each scenario has `leftOut` participants;
- scenarios are ranked coverage-first;
- UI renders scenario cards as containers of circles;
- existing freeze code can keep using a compatibility wrapper.

### In Scope

- New scenario-level types in `lib/matching/scenarios.ts`.
- Scenario generation that evaluates whole scenarios, not only individual circles.
- Coverage-first ranking at scenario level.
- `MatchingScenarios` renders scenario cards with nested circles and left-out participants.
- `/matching` and `/api/matching/state` pass scenario overview data in the new shape.
- Unit tests for scenario ranking and greedy-regression cases.
- Existing `generateScenarios()` remains available for freeze compatibility.

### Out of Scope

- Dynamic `minGroupSize` / `maxGroupSize` DB migration.
- Personal move redesign as scenario unlocks.
- Rank-change moves.
- Hover/focus linked highlighting.
- Admin UI changes.

### Preserve Existing Matching-Session Contract

Slice 1 is a rewrite of scenario calculation and scenario cards only. It must not remove, rewrite, or regress the surrounding matching-session functionality unless the change is explicitly called out in this spec.

Features that must be preserved:

- **Session creation flow**
  - Admin can create a matching session from the admin panel.
  - Creation keeps `name`, optional `deadlineAt`, and configured `minGroupSize`/`maxGroupSize`.
  - Only one `active` session exists at a time.
  - No DB migration is introduced in Slice 1.
- **Session lifecycle**
  - `active` / `frozen` status behavior remains unchanged.
  - Admin freeze still works and stores a valid frozen scenario representation.
  - Frozen sessions remain read-only for participants.
  - Deadline remains advisory; it does not auto-freeze the session.
- **Participant identity and pseudonyms**
  - Authenticated users can join the active session.
  - Joining assigns a stable anonymous pseudonym from the existing pseudonym dictionary.
  - Pseudonyms remain stable within the session.
  - User ids are not shown in participant-facing matching UI.
- **Participant widget/header**
  - Header keeps session name, group-size label, deadline, active/frozen status, current user's pseudonym, leave button, and participant popover.
  - Participant popover still shows pseudonyms and names according to the current admin/user visibility rules.
- **Leave and rejoin**
  - Participant can leave an active session.
  - After leaving, `matching_session_participants` row is removed.
  - Reopening `/matching` can auto-join them again with a new pseudonym while existing book signups/priorities remain.
- **Admin impersonation**
  - Admin can open `/matching?as=<userId>`.
  - Impersonation shows that participant's personal list, scenario view, and personal moves.
  - Impersonation is marked as admin mode and lets admin add/remove books, reorder priorities, and change statuses for the viewed participant.
  - Admin view is audited in `admin_views`.
- **Personal catalog/list behavior**
  - User can add/remove books from their matching list.
  - Drag-and-drop priority ordering remains.
  - Rank nudge behavior remains.
  - Books marked `reading` / `read` remain excluded from matching calculations.
  - Status dropdown labels and behavior remain unchanged.
- **Book detail modal**
  - Clicking a book in catalog, scenarios, or moves opens the shared book detail modal.
  - Modal keeps cover, author, metadata, tags, description, why-read text, text URL, recommendation link, participant chips, status dropdown, add/remove actions where applicable, close button, and Escape close.
- **Realtime**
  - Mutations still broadcast matching state changes.
  - SSE remains primary realtime mechanism.
  - Polling fallback remains.
  - Other open clients still refresh without manual reload.
- **Admin participant management**
  - Admin can add/remove participants from an active session in the admin panel.
  - Added participants receive pseudonyms using the same assignment logic.
  - Changes broadcast realtime state updates.
- **API compatibility**
  - Existing matching endpoints remain available.
  - `GET /api/matching/state` may add `scenarioSetOverview`, but should preserve transitional fields currently used by clients/tests where practical.
  - Existing mutation guards for frozen sessions and impersonation remain.

Non-regression tests should be updated or added if the implementation touches any of these areas.

### Target Data Contracts

Add these exported types in `lib/matching/scenarios.ts`:

```ts
export interface MatchingCircle {
  id: string
  bookId: string
  members: GroupMember[]
  minSize: number
  maxSize: number
  wantsCount: number
  avgRank: number | null
  worstRank: number | null
  unrankedCount: number
}

export interface ScenarioScore {
  coveredCount: number
  totalCount: number
  coverageRatio: number
  strongInterestCount: number
  rankedCount: number
  unrankedCount: number
  rankSum: number
  avgRank: number | null
  worstRank: number | null
}

export interface MatchingScenario {
  id: string
  tier: 'leader' | 'full-coverage' | 'best-achievable-partial' | 'partial' | 'blocked-better'
  circles: MatchingCircle[]
  leftOut: ScenarioParticipant[]
  score: ScenarioScore
}

export interface ScenarioSetOverview {
  scenarios: MatchingScenario[]
  leader: MatchingScenario | null
  totalCount: number
  minGroupSize: number
  maxGroupSize: number
}
```

Compatibility:

- Keep `ScenarioCard`, `ScenarioCandidate`, and `ScenarioOverview` only if needed during migration.
- `generateScenarios(input): ScenarioCard[]` should remain for `app/api/matching/sessions/[id]/freeze/route.ts`.
- Prefer adding `generateScenarioSets(input): ScenarioSetOverview` and then gradually redirecting callers.

### Engine Algorithm

Implement in `lib/matching/scenarios.ts`.

Step 1: Build candidate circles.

- For each published session book with at least `minGroupSize`/`maxGroupSize` active signups, create possible circles of exactly `minGroupSize`/`maxGroupSize` participants.
- If `minGroupSize === maxGroupSize`, `minSize` and `maxSize` are equal; otherwise the engine considers every circle size in the configured range.
- For small inputs, use combination search. Current tests already cover up to `N=30`, `M=50`; preserve performance guard.
- Score each circle with the current member metrics: `wantsCount`, `avgRank`, `worstRank`, `unrankedCount`.

Step 2: Build scenario sets.

- A scenario is a non-overlapping set of candidate circles.
- No participant repeats inside a scenario.
- No book repeats inside a scenario.
- Generate enough candidate scenarios to confidently select the top results.
- For v1, a bounded backtracking search is acceptable:
  - sort candidate circles by local score as a heuristic;
  - recursively include/skip circles;
  - prune when remaining candidates cannot beat current best coverage;
  - cap returned scenarios to `maxResults`.

Step 3: Score scenarios.

- `coveredCount` = unique members across all circles.
- `totalCount` = all session participants.
- `strongInterestCount` = sum of members with `rank !== null && rank <= 3`.
- `rankedCount` = members with `rank !== null`.
- `unrankedCount` = covered members without rank.
- `rankSum`, `avgRank`, `worstRank` are aggregated across all covered ranked members.

Step 4: Sort scenarios.

Use the ranking model above:

1. `coveredCount DESC`
2. `strongInterestCount DESC`
3. `avgRank ASC`, null last
4. `worstRank ASC`, null last
5. `unrankedCount ASC`
6. stable scenario id

Step 5: Assign tiers.

- First scenario after sorting is `leader`.
- Scenarios with `coveredCount === totalCount` are `full-coverage`, except leader stays `leader`.
- Scenarios with the highest non-full coverage are `best-achievable-partial`.
- Lower coverage scenarios are `partial`.
- `blocked-better` can be deferred until Slice 2 if no personal move data is available yet.

### UI Changes

`components/nd/MatchingScenarios.tsx`

- Replace list of individual scenario/candidate cards with a list of scenario cards.
- Each scenario card renders:
  - tier label;
  - `circles.length` count;
  - coverage summary `coveredCount/totalCount`;
  - nested circle rows with cover, title, and member chips;
  - `За бортом` chips when `leftOut.length > 0`.
- Clicking a nested circle's book title opens the existing shared `MatchingBookDetailModal`.
- Empty state remains:
  - `Пока недостаточно участников или записей для формирования кругов. Нужно минимум {minGroupSize}`.

`app/matching/page.tsx`

- Fetch book details for every `circle.bookId` in every returned scenario.
- Pass `ScenarioSetOverview` to `MatchingScenarios`.

`app/api/matching/state/route.ts`

- Return the new overview under `scenarioSetOverview`.
- Keep old fields (`scenarios`, `scenarioOverview`) during transition if existing clients/tests expect them.

### Tests

Unit tests in `lib/matching/__tests__/scenarios.test.ts`.

Required cases:

1. Empty inputs return `leader: null` and no scenarios.
2. A single book with exactly `minGroupSize`/`maxGroupSize` signups returns one scenario with one circle and correct `leftOut`.
3. Two disjoint books produce one scenario with two circles and full coverage.
4. Full coverage beats better average rank with partial coverage.
   - Example: scenario A covers `6/6` with average rank 5; scenario B covers `3/6` with average rank 1. A wins.
5. Among equal coverage scenarios, more top-3 placements wins.
6. Among equal coverage and equal top-3 count, lower `avgRank` wins.
7. Among equal average rank, lower `worstRank` wins.
8. Greedy regression:
   - Build data where the locally best circle overlaps with two weaker circles.
   - Expected leader is the two-circle scenario with greater `coveredCount`, not the locally best one-circle scenario.
9. No participant repeats inside a scenario.
10. No book repeats inside a scenario.
11. `generateScenarios()` compatibility wrapper still returns a `ScenarioCard[]` usable by freeze route tests.
12. Performance guard stays within current bound for `N=30`, `M=50`.

Component/API tests:

- Update `app/api/matching/state/route.test.ts` to expect `scenarioSetOverview`.
- Update or add component test for `MatchingScenarios` if the existing testing pattern supports it.

E2E:

- Not required for Slice 1 if UI shape changes are covered by existing matching E2E smoke.
- If touching visible `/matching` scenario markup significantly, update `e2e/matching-reader-circles.spec.ts` to assert scenario card coverage and nested circle rendering.

### Acceptance Criteria

Given six participants and two disjoint complete circles  
When `/matching` renders  
Then `Читательские круги` shows one scenario card with two nested circles and `6/6` coverage.

Given one high-preference circle covers three of six participants and another scenario covers all six with lower preferences  
When scenarios are ranked  
Then the full-coverage scenario is the leader.

Given two scenarios cover the same number of participants  
When one has more members reading top-3 books  
Then that scenario ranks higher.

Given a scenario does not cover everyone  
When it renders  
Then it shows `За бортом` with the excluded participants' pseudonyms.

Given the admin freezes the session  
When freeze route calls the compatibility API  
Then freeze still stores a valid leader representation and existing freeze tests pass.

### Verification Commands

Run before commit:

```bash
npm run lint
npm run typecheck
npm test -- lib/matching/__tests__/scenarios.test.ts app/api/matching/state/route.test.ts app/api/matching/sessions/[id]/freeze/route.test.ts
npm test
npm run build
```

If `/matching` visible markup changes:

```bash
npx playwright test e2e/matching-reader-circles.spec.ts
```

### Implementation Notes

- Do not introduce DB changes in this slice.
- Keep `minGroupSize`/`maxGroupSize` as the fixed circle size.
- Prefer pure functions in `lib/matching/scenarios.ts`; no DB access inside the engine.
- Keep stable ordering to avoid flickering UI after realtime refresh.
- Beware combinatorial explosion: tests should protect both correctness and performance.

### Slice 2: Personal moves as scenario unlocks

Files:

- `lib/matching/my-moves.ts`
- `components/nd/MatchingMyMoves.tsx`
- `e2e/matching-reader-circles.spec.ts`

Actions:

- Replace book-only move cards with scenario-impact cards.
- Simulate current user's possible actions.
- Group actions that produce the same resulting scenario.
- Add E2E for the Maria / Consensus / Neoliberalism case.

### Slice 3: Dynamic min/max group size

Files:

- `lib/db/schema.ts`
- new Drizzle migration
- `components/nd/AdminMatchingSession.tsx`
- `app/api/matching/sessions/route.ts`
- `components/nd/MatchingHeader.tsx`
- `lib/matching/scenarios.ts`

Actions:

- Add `min_group_size` and `max_group_size`.
- Default both to `3` for existing rows in this project.
- Admin can set and update both values.
- Scenario engine uses `[minGroupSize, maxGroupSize]`.

### Slice 4: Linked highlighting

Files:

- `components/nd/MatchingScenarios.tsx`
- `components/nd/MatchingMyMoves.tsx`
- possibly shared client state in `app/matching/page.tsx` or a wrapper component

Actions:

- Add linked scenario ids to move cards.
- On hover/focus, set active highlighted scenario id.
- Apply subtle highlight and dimming.

## Open Questions

- Do we want to show multiple current scenarios by default, or only top scenario plus expandable alternatives?
- Should partial but high-desire scenarios appear in `Читательские круги` always, or only when they explain a personal move?
- What exact score language is acceptable in UI: `лучше по желаниям`, `более удачный расклад`, `сильнее по приоритетам`?
- Can a personal move include changing rank, or should v1 only include adding books?
- Should admin freeze store the whole winning scenario or only the top scenario summary as now?

## Recommended V1

V1 should include:

- scenario cards with multiple circles and left-out participants;
- personal move cards that show resulting scenario;
- only add-book moves, no rank-change moves yet;
- fixed group size using current `minGroupSize`/`maxGroupSize`;
- no DB migration yet;
- hover/focus highlighting if cheap, otherwise defer to V1.1.

This gives the main product improvement without immediately taking on dynamic group-size complexity.
