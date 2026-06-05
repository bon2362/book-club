# Matching: режим расчёта «удовлетворённость» (satisfaction mode)

**Дата:** 2026-06-05
**Статус:** дизайн утверждён, готов к плану реализации
**Область:** `/matching` — логика расчёта сценариев и ходов

## Проблема и цель

Сейчас сценарии ранжируются **покрытие-первым**: критерий №1 — `coveredCount`
(сколько участников попало в группы), затем удовлетворённость и пр.
(см. `compareScenarioScore` в `lib/matching/scenarios.ts`).

Организатор хочет противоположный приоритет для части сессий:
**сначала удовлетворённость участников, покрытие — вторично.** Идея в том, чтобы
помогать людям находить **лучшее пересечение интересов** среди них, даже если часть
участников при этом остаётся без группы (это нормально — они посмотрят на чужие
интересы и изменят свой выбор или дождутся новых участников).

## Принцип дизайна

Система **не решает за людей, что для них лучше.** Она показывает, **в какие сценарии
человек попадает**, и даёт инструменты влиять на исход (добавить/убрать книгу, изменить
ранг). Ранжирование сценариев нужно только для **однозначного порядка вывода**, а не как
вердикт «вот ваш идеальный круг». При равной удовлетворённости показываем **все** такие
сценарии — финальный выбор за людьми.

## Решения (зафиксированы в брейнсторме)

1. **Удовлетворённость строго важнее покрытия** (не «сумма баллов», не «бэнд покрытия»).
2. **Модель сравнения сценариев — лексикографически по качеству групп** (см. §3).
3. **Качество одной группы — «сначала среднее»**: `avg rank ↑`, затем `worst rank ↑`.
   (Намеренно НЕ leximin: мы не выносим суждение о справедливости за людей, только
   задаём однозначный порядок. avg-first достаточно для детерминизма.)
4. **Слабые группы формируются** (ранжируются последними); за бортом остаётся только
   тот, для кого группа вообще не складывается.
5. **Режим фиксируется при создании сессии**, без живого переключения. Дефолт —
   `coverage` (текущее поведение неизменно). `satisfaction` — opt-in тип сессии.
6. **Гейт по ранжированию** только в satisfaction: без ранга участник не попадает в пул
   подбора. Реализуется отдельным **промежуточным экраном ранжирования** (§4).
7. **Ходы рассчитываются по режиму сессии** (§5).

## Архитектурный принцип де-риска

Coverage-путь **не меняется ни на байт**. Всё новое живёт за `mode === 'satisfaction'`.
Существующие сессии и live-поведение не затрагиваются; satisfaction — чисто аддитивный
opt-in.

---

## 1. Модель данных

Новая колонка в `matching_sessions` (`lib/db/schema.ts`):

```ts
optimizationMode: text('optimization_mode').notNull().default('coverage'),
// 'coverage' | 'satisfaction'
```

- Drizzle-миграция `drizzle/0038_matching_optimization_mode.sql`:
  `ALTER TABLE "matching_sessions" ADD COLUMN "optimization_mode" text NOT NULL DEFAULT 'coverage';`
- `GenerateScenariosInput` получает поле `mode: 'coverage' | 'satisfaction'`
  (опционально, дефолт `'coverage'` для обратной совместимости вызовов).

## 2. Создание сессии

- `app/api/matching/sessions/route.ts` (POST): принимает `optimizationMode`,
  валидирует (`'coverage' | 'satisfaction'`, дефолт `'coverage'`), пишет в строку.
- `components/nd/AdminMatchingSession.tsx`: селектор режима в форме создания сессии
  (через токены дизайн-системы, без сырых хексов; острые углы).

## 3. Движок расчёта (satisfaction-компаратор)

Хирургическая правка `lib/matching/scenarios.ts`: рядом с существующими (coverage)
компараторами добавляются satisfaction-варианты, выбор по `input.mode`. Beam search,
генерация кружков-кандидатов и `selectDiverseCircles` структурно не меняются — меняются
только функции сравнения, которые они используют.

### 3.1 Качество кружка (satisfaction)

В satisfaction-режиме у всех участвующих записей есть ранг (гейт, §4), поэтому
`unrankedCount` для satisfaction всегда 0.

```
compareCircleSatisfaction(a, b):  // положительное → a лучше b
  if a.avgRank != b.avgRank:  return b.avgRank - a.avgRank   // меньше avg → лучше
  if a.worstRank != b.worstRank: return b.worstRank - a.worstRank
  if a.size != b.size:        return a.size - b.size          // больше людей → лучше
  return b.id.localeCompare(a.id)                              // детерминизм
```

### 3.2 Сравнение сценариев (satisfaction)

Лексикографически по отсортированному вектору качества групп:

```
compareScenarioSatisfaction(a, b):  // положительное → a лучше b
  as = a.circles, отсортированные compareCircleSatisfaction (лучший первым)
  bs = b.circles, отсортированные так же
  for i in 0 .. max(len(as), len(bs)) - 1:
    ca = as[i] | undefined; cb = bs[i] | undefined
    if ca && cb:
      c = compareCircleSatisfaction(ca, cb); if c != 0: return c
    else if ca && !cb: return +1     // лишняя группа > пустоты (покрытие «бесплатно»)
    else if !ca && cb: return -1
  // полное равенство векторов → добиваем для стабильного порядка списка:
  if a.score.avgRank != b.score.avgRank: return b.score.avgRank - a.score.avgRank
  if a.score.strongInterestCount != b.score.strongInterestCount:
      return a.score.strongInterestCount - b.score.strongInterestCount
  return b.id.localeCompare(a.id)
```

**Свойства (проверяемые в unit-тестах):**

| Сравнение | Победитель | Почему |
|-----------|-----------|--------|
| `[1,1,1 \| 2,2,2]` (6) vs `[1,1,1 \| 3,3,3 \| 4,4,4]` (9) | первый (6 чел) | топ равны → группа₂ `2,2,2` < `3,3,3` |
| `[1,1,1]` (3) vs `[1,1,1 \| 2,2,2 \| 2,2,2]` (9) | второй (9 чел) | топ равны → у первого пусто на позиции 2 |
| `[1,1,1]` (3) vs `[2,2,2 \| 2,2,2]` (6) | первый (3 чел) | топ `1,1,1` < `2,2,2` — удовлетворённость строго первее |
| `(1,1,6)` vs `(3,3,3)` как кружок | `(1,1,6)` | avg 2.67 < 3.0 (решение №3: «сначала среднее») |

### 3.3 Выбор компаратора по режиму

`mode` прокидывается в точки, где сейчас жёстко вызывается coverage-компаратор:
`selectDiverseCircles`, финальная сортировка `buildCandidateCircles`,
`compareStates` / `buildScenarioStates`, финальная сортировка в `generateScenarioSets`,
`generateScenarioOverview`. Сигнатуры `generateScenarioSets` / `generateScenarioOverview`
/ `generateScenarios` читают `input.mode`.

### 3.4 Тиры в satisfaction

Coverage-тиры (`full-coverage` / `best-achievable-partial`) не применяются. В satisfaction:
индекс 0 → `leader`, остальные → `partial`. UI не подаёт `leader` как «оптимум» —
копирайт нейтральный (§6). Тип `MatchingScenario['tier']` переиспользуется как есть.

## 4. Гейт «без ранга» + промежуточный экран

**Фильтрация входа.** В satisfaction-режиме в `fetchScenarioInput` (`app/matching/page.tsx`)
и `fetchScenarioInputForSession` (`lib/matching/scenario-input.ts`) в `signups` идут только
записи, у которых есть `bookPriorities.rank`. Записи без ранга отбрасываются. Участник без
единого ранга → ни в одной группе → в `leftOut`. Оба билдера читают `session.optimizationMode`.

**Промежуточный экран `MatchingRankingGate`** (новый client-компонент):
- **Когда показывается** (решается в `app/matching/page.tsx`):
  `mode === 'satisfaction'` **и** не импersonation **и** статус сессии `active` **и** у
  зрителя **нет ни одного заранжированного активного signup'а**.
- **Содержимое:** каталог + личный список с drag (переиспользуем примитивы
  `MatchingPersonalList`), заголовок-объяснение, CTA «Войти в подбор».
- **Поведение без «прыжков»:** компонент **молча коммитит** приоритеты на сервер
  (PATCH `/api/matching/priorities`, POST `/api/matching/books`), **но не вызывает
  `router.refresh()` на каждое действие.** Переход на доску — только по явному клику
  «Войти в подбор». Иначе первый же ранг (через авто-refresh `MatchingPersonalList`)
  перерисовал бы страницу и выбросил человека на доску посреди ранжирования.
- **Порог:** CTA активна при **≥1 заранжированной активной книге**.
- **Админ-импersonation** (`?as=`) гейт не видит — всегда доска (для поддержки).

**Поток в satisfaction-сессии:**
1. Не участник → `MatchingWelcome` (псевдоним + join) — без изменений.
2. Вступил, нет рангов → **`MatchingRankingGate`**.
3. ≥1 ранг + «Войти в подбор» → доска.

(Если позже satisfaction-участник уберёт все книги/ранги — снова увидит гейт. Это логично:
нет предпочтений → не в пуле.)

## 5. Ходы по режиму

`lib/matching/move-impact.ts` ветвится по `mode`:
- **coverage** — как сейчас: ход meaningful при росте покрытия; сортировка по
  `coverageGain`; метрика «покрытие».
- **satisfaction** — в симулированном новом лидере зритель уже обязан стоять на
  добавленной книге (это уже проверяет существующий `scenarioIncludesMove`). Ход
  meaningful, если зритель при этом **оказывается лучше, чем был**: был в `leftOut` →
  теперь размещён, ИЛИ его ранг на новой книге **строго лучше** ранга в его текущем
  размещении в лидере. Рост покрытия НЕ обязателен (правило «zero-sum если покрытие
  плоское» в satisfaction не применяется). Со-участники круга показываются как
  контекст-бенефициары. В `impact` добавляется поле прироста удовлетворённости;
  `sortMovesByImpact` в satisfaction сортирует по нему.

Проводка:
- `addMoveImpacts` (`app/matching/page.tsx`) и обработчик `app/api/matching/state/route.ts`
  прокидывают `mode` в `generateScenarioSets` (симуляция добавления книги) и в `buildMoveImpact`.
- `components/nd/MatchingMyMoves.tsx`: пилюли метрик и текст «почему» (`MoveWhyText`,
  `ImpactMetricPills`) получают satisfaction-вариант копирайта
  («посадит тебя в книгу, которую ты хочешь сильнее» / «соберёт круг, где интересы
  совпадают лучше»). Пустое состояние «нет ходов» — нейтральная формулировка под режим.

## 6. UI / копирайт

- `components/nd/MatchingImpactWorkspace.tsx` / `MatchingScenarios.tsx`: в satisfaction —
  нейтральные «Сценарий 1…N» по удовлетворённости, показываем `avg`-качество круга, не
  подаём первый как «оптимум». Режим прокидывается в эти компоненты (через `overview`
  или явным пропом).
- `components/nd/MatchingAdriftBanner.tsx`: «ты не в топ-сценарии» в satisfaction —
  норма by design; копирайт смягчается под режим, чтобы не пугать «за бортом».
- Дизайн-система проекта: только токены `var(--…)`, острые углы, без теней, без тёмной
  темы. Круг — только для аватаров.

## 7. Тесты

**Unit (`lib/matching/__tests__/scenarios.test.ts`):**
- satisfaction-компаратор на четырёх кейсах из §3.2;
- avg-first для качества кружка (`(1,1,6)` > `(3,3,3)`);
- «лишняя группа > пустоты»;
- гейт-фильтрация: signup без ранга не попадает в группы (satisfaction), но попадает
  (coverage) — параметризованный тест по `mode`.

**Unit — `move-impact` satisfaction-ветка:** ход без роста покрытия, но с улучшением
ранга зрителя — meaningful; сортировка по приросту удовлетворённости.

**E2E (новый спек, напр. `e2e/matching-satisfaction.spec.ts`):**
- создать satisfaction-сессию (фикстура);
- участник без рангов видит `MatchingRankingGate` (не доску);
- расставил приоритеты + «Войти в подбор» → появляется на доске и в сценарии;
- проверка порядка сценариев (satisfaction-first);
- **`page.reload()`** после ранжирования — состояние персистится (правило reload).
- Изоляция от прод-БД через фикстуры (`e2e/fixtures.ts`), новые сущности — через фикстуру.

## 8. Затрагиваемые файлы (карта изменений)

**Схема / миграция**
- `lib/db/schema.ts` — колонка `optimizationMode`.
- `drizzle/0038_matching_optimization_mode.sql` — ALTER TABLE.

**Движок**
- `lib/matching/scenarios.ts` — `mode` в `GenerateScenariosInput`; satisfaction-компараторы;
  выбор по режиму в beam/selection/сортировках; тиры.

**Гейт / вход**
- `app/matching/page.tsx` — фильтр входа по рангу; рендер `MatchingRankingGate`; проводка `mode`.
- `lib/matching/scenario-input.ts` — фильтр входа по рангу; чтение `mode` из сессии.

**Создание сессии**
- `app/api/matching/sessions/route.ts` — приём/валидация/запись `optimizationMode`.
- `components/nd/AdminMatchingSession.tsx` — селектор режима.

**Ходы**
- `lib/matching/move-impact.ts` — ветка satisfaction.
- `app/api/matching/state/route.ts` — проводка `mode` в сценарии и ходы.
- `components/nd/MatchingMyMoves.tsx` — копирайт по режиму.

**UI**
- `components/nd/MatchingRankingGate.tsx` — новый промежуточный экран.
- `components/nd/MatchingImpactWorkspace.tsx`, `MatchingScenarios.tsx` — копирайт/лейблы по режиму.
- `components/nd/MatchingAdriftBanner.tsx` — копирайт по режиму.

**Прочее**
- `lib/matching/public-state.ts` — проверить, что satisfaction-overview корректно
  псевдонимизируется (вероятно без изменений).

## 9. Порядок реализации

1. Миграция + схема + `mode` в `GenerateScenariosInput`.
2. Движок: satisfaction-компараторы + unit-тесты (TDD).
3. Гейт-фильтрация входа + unit.
4. Создание сессии (API + админ-форма).
5. Промежуточный экран `MatchingRankingGate` + проводка рендера.
6. Ходы по режиму (move-impact + state API + MyMoves копирайт).
7. UI/копирайт сценариев + adrift.
8. E2E.

## 10. Риски

- **Большая поверхность** (движок, 2 input-билдера, ходы, state API, неск. UI-компонентов).
  Митигируется: coverage-путь неизменен, всё за `mode === 'satisfaction'`.
- **Beam search + satisfaction-компаратор:** одиночный «идеальный» кружок ранжируется выше
  частичных расширений до момента, пока расширение не добавит ещё группу (тогда полнее →
  лучше). Покрытие кандидатов (`selectDiverseCircles`, топ-24/книга) — тот же риск отсечения,
  что и сегодня; для размеров книжного клуба приемлемо.
- **Freeze / метрики** (`frozenScenarioJson`, `metricCoverage`): замораживается текущий
  расчёт режима; `metricCoverage` остаётся вычислимой. Проверить, что freeze не падает
  на частичных satisfaction-сценариях.

## 11. Открытые дефолты (подтвердить при ревью спеки)

- Порог гейта: **≥1 заранжированная активная книга**.
- Промежуточный экран коммитит молча, навигация — по явной CTA.
- Импersonation обходит гейт.
- Слабые группы формируются и ранжируются последними (решение №4).
