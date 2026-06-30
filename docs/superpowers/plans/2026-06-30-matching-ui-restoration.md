# Matching UI Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Восстановить полноценную satisfaction-доску matching по утверждённому high-fidelity handoff, сохранив новое транзакционное ядро, реальные имена и observer-механику.

**Architecture:** Разделить внутреннюю reconciliation-модель и безопасный presentation read-model. Вернуть header/workspace как отдельные компоненты, передавать сценариям полные презентационные данные через opaque participant refs и использовать существующий `BookDetailProvider`. Основная проверка выполняется сквозными E2E пользовательских историй; bounding-box тесты остаются дополнительным слоем.

**Tech Stack:** Next.js 14, React, TypeScript, Drizzle ORM, Neon Postgres, Jest/Testing Library, Playwright.

---

## Execution constraints

- Перед реализацией использовать `github-tasks`, если для восстановления создан GitHub Issue.
- Создать отдельный worktree от свежего `origin/main`; не продолжать в planning-worktree.
- Перед изменением E2E прочитать `docs/features/testing.md` полностью.
- Не возвращать код из legacy-тега копированием: использовать его только как справочник.
- Любая matching-мутация идёт через `runMatchingTransition` и `withAuditContext`.
- До каждого commit запускать `npm run lint && npm run typecheck`; для UI commit дополнительно `npm test` и `npm run test:e2e e2e/ui-states.spec.ts`.
- Перед каждым commit зафиксировать `E2E: нужен/не нужен` и `Wiki: нужна/не нужна`.

## Target file structure

- Create `lib/matching/scenario-overview-db.ts` — единая загрузка полного satisfaction overview для transition и public read-model.
- Modify `lib/matching/session-transition-db.ts` — преобразовывать full overview в reconciliation DTO без потери presentation-данных для UI.
- Modify `lib/matching/public-state.ts` — безопасный participant-facing DTO.
- Modify `lib/matching/public-state-db.ts` — книги, дедлайн, full overview, name snapshots.
- Create `components/nd/MatchingHeader.tsx` — восстановленная шапка без feed/mode legacy.
- Create `components/nd/MatchingWorkspace.tsx` — одноколоночная панель сценариев и pending-state.
- Modify `components/nd/MatchingScenarios.tsx` — high-fidelity scenario/circle cards и confirmation states.
- Modify `components/nd/MatchingLockedCircles.tsx` — primary observer result и общий registry.
- Modify `components/nd/MatchingRealtimeClient.tsx` — хранить полный public state и обновлять online refs.
- Modify `app/matching/page.tsx` — единая композиция flow без пустого board-slot.
- Modify matching unit/component/E2E tests and `public/openapi.json`.

### Task 1: Зафиксировать безопасный presentation contract красными тестами

**Files:**
- Modify: `lib/matching/__tests__/public-session-state.test.ts`
- Modify: `lib/matching/__tests__/public-matching-state.test.ts`
- Modify: `lib/matching/__tests__/session-transition-db.test.ts`
- Test: `lib/matching/__tests__/public-session-state.test.ts`

- [ ] **Step 1: Добавить fixture полного сценария**

```ts
const overview = {
  scenarios: [{
    id: 'scenario-internal',
    tier: 'leader' as const,
    score: { coveredCount: 2, totalCount: 3, strongInterestCount: 1, rankedCount: 2, unrankedCount: 0, rankSum: 3, avgRank: 1.5, worstRank: 2 },
    leftOut: [{ userId: 'u3', displayName: 'Вера' }],
    circles: [{
      id: 'circle-internal', bookId: 'b1', minSize: 2, maxSize: 2,
      wantsCount: 1, avgRank: 1.5, worstRank: 2, unrankedCount: 0,
      members: [
        { userId: 'u1', displayName: 'Анна', rank: 1, interest: 'очень хочу' as const },
        { userId: 'u2', displayName: 'Борис', rank: 2, interest: 'очень хочу' as const },
      ],
    }],
  }],
  leader: null,
  totalCount: 3,
  minGroupSize: 2,
  maxGroupSize: 2,
}
```

- [ ] **Step 2: Написать тест presentation DTO**

```ts
expect(state.scenarios[0]).toMatchObject({
  ref: 'scenario-1',
  score: { coveredCount: 2, totalCount: 3, avgRank: 1.5 },
  leftOut: [{ ref: 'p3', displayName: 'Вера' }],
})
expect(state.scenarios[0].circles[0]).toMatchObject({
  bookId: 'b1', avgRank: 1.5,
  members: [{ ref: 'p1', displayName: 'Анна', rank: 1, interest: 'очень хочу' }],
})
expect(JSON.stringify(state)).not.toMatch(/\bu[123]\b/)
expect(JSON.stringify(state)).not.toContain('scenario-internal')
expect(JSON.stringify(state)).not.toContain('circle-internal')
```

- [ ] **Step 3: Написать тест safe frozen snapshot**

```ts
expect(state.session.frozenSnapshot).toEqual({
  remainingScenario: expect.objectContaining({ ref: 'frozen-scenario-1' }),
})
expect(JSON.stringify(state.session.frozenSnapshot)).not.toContain('userId')
```

- [ ] **Step 4: Запустить тесты и увидеть ожидаемое падение**

Run:

```bash
npm test -- --runInBand lib/matching/__tests__/public-session-state.test.ts lib/matching/__tests__/public-matching-state.test.ts lib/matching/__tests__/session-transition-db.test.ts
```

Expected: FAIL — `score`, `leftOut`, `rank`, safe frozen snapshot отсутствуют.

### Task 2: Разделить full overview и reconciliation DTO

**Files:**
- Create: `lib/matching/scenario-overview-db.ts`
- Create: `lib/matching/__tests__/scenario-overview-db.test.ts`
- Modify: `lib/matching/session-transition-db.ts`
- Modify: `lib/matching/public-state-db.ts`

- [ ] **Step 1: Вынести загрузку полного overview**

```ts
export async function fetchMatchingScenarioOverview(
  sessionId: string,
  dbClient: DbClient = db,
): Promise<ScenarioSetOverview> {
  // Load session sizes, active participants excluding unreleased locked members,
  // published books, active signups and ranks; then call
  // generateSatisfactionScenarioSets without stripping score/leftOut/member ranks.
}
```

- [ ] **Step 2: Покрыть исключение observers**

```ts
expect(overview.scenarios.flatMap(s => s.circles).flatMap(c => c.members))
  .not.toEqual(expect.arrayContaining([expect.objectContaining({ userId: 'locked-user' })]))
```

- [ ] **Step 3: Использовать full overview в transition store**

```ts
async getRankedScenarios(sessionId: string) {
  const overview = await fetchMatchingScenarioOverview(sessionId, this.tx)
  return toRankedReconciliationScenarios(sessionId, overview.scenarios)
}
```

- [ ] **Step 4: Public state получает full overview отдельно**

```ts
const [overview, confirmations, lockedCircleRows, notices] = await Promise.all([
  fetchMatchingScenarioOverview(sessionId, dbClient),
  // existing queries
])
```

- [ ] **Step 5: Запустить узкие тесты**

Run:

```bash
npm test -- --runInBand lib/matching/__tests__/scenario-overview-db.test.ts lib/matching/__tests__/session-transition-db.test.ts
```

Expected: PASS.

### Task 3: Построить безопасный public state для полноценного UI

**Files:**
- Modify: `lib/matching/public-state.ts`
- Modify: `lib/matching/public-state-db.ts`
- Modify: `app/api/matching/state/route.test.ts`
- Modify: `public/openapi.json`

- [ ] **Step 1: Определить presentation DTO**

```ts
interface PublicScenarioMember {
  ref: string
  displayName: string
  rank: number | null
  interest: 'очень хочу' | 'хочу' | 'без ранга'
  confirmed: boolean
}

interface PublicScenario {
  ref: string
  score: { coveredCount: number; totalCount: number; avgRank: number | null; worstRank: number | null }
  leftOut: Array<{ ref: string; displayName: string }>
  circles: PublicScenarioCircle[]
}
```

- [ ] **Step 2: Добавить session и participant header data**

```ts
session: {
  name, status, stateVersion, minGroupSize, maxGroupSize,
  deadlineAt: deadlineAt?.toISOString() ?? null,
  frozenSnapshot: safeFrozenSnapshot,
},
participants: participants.map(p => ({
  ref: p.publicRef,
  displayName: p.displayName,
  online: p.online,
  confirmedCircleKey: confirmationByUser.get(p.userId)?.circleKey ?? null,
}))
```

- [ ] **Step 3: Заменить raw IDs в RSC catalog props на refs**

```ts
export interface BookParticipant {
  ref: string
  bookId: string
  displayName: string
  rank: number | null
  personalStatus: string | null
}
```

- [ ] **Step 4: Проверить API JSON на отсутствие IDs**

```ts
expect(JSON.stringify(payload)).not.toContain(userId)
expect(payload.participants[0]).toEqual(expect.objectContaining({ ref: expect.any(String) }))
```

- [ ] **Step 5: Запустить contract tests**

Run:

```bash
npm test -- --runInBand lib/matching/__tests__/public-session-state.test.ts app/api/matching/state/route.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit read-model foundation**

```bash
git add lib/matching app/api/matching/state public/openapi.json
git commit -m "refactor: expose safe matching presentation state"
```

### Task 4: Исправить notices, retry и semantic events до UI

**Files:**
- Modify: `lib/matching/session-transition.ts`
- Modify: `lib/matching/session-transition-db.ts`
- Modify: `lib/matching/public-state.ts`
- Modify: `lib/matching/__tests__/session-transition.test.ts`
- Modify: `lib/matching/__tests__/public-session-state.test.ts`
- Modify: `lib/matching/__tests__/matching-event-display.test.ts`

- [ ] **Step 1: Тест retry после потерянного ответа**

```ts
store.session.stateVersion = 5
store.confirmations = [confirmation('u1', 'circle-a')]
await expect(executeMatchingTransition({
  sessionId: 's1', actor, expectedStateVersion: 4,
  action: { type: 'set_confirmation', userId: 'u1', circleKey: 'circle-a' },
}, store)).resolves.toEqual({ changed: false, stateVersion: 5 })
```

- [ ] **Step 2: Проверять достигнутое confirmation перед stale rejection**

```ts
if (input.action.type === 'set_confirmation') {
  const existing = (await store.getConfirmations(input.sessionId))
    .find(item => item.userId === input.action.userId)
  if (existing?.circleKey === input.action.circleKey) {
    return { changed: false, stateVersion: session.stateVersion }
  }
}
```

- [ ] **Step 3: Хранить display-name snapshots в notice payload**

```ts
payload: {
  fromMembers: await store.getDisplayNames(transfer.fromMemberUserIds),
  toMembers: await store.getDisplayNames(transfer.toMemberUserIds),
}
```

- [ ] **Step 4: Тест notice после ухода участника**

```ts
expect(() => assemblePublicSessionState({
  participants: [anna],
  notices: [transferNoticeWithSnapshots(['Анна', 'Борис'], ['Анна', 'Вера'])],
  // Борис больше не participant
})).not.toThrow()
```

- [ ] **Step 5: Добавить отдельные semantic events**

```ts
{ eventType: 'welcome_name_changed', before: { name: oldName }, after: { name: newName } }
{ eventType: 'circle_dissolved', bookId, before: { circleKey, members }, after: null, metadata: { reason } }
```

- [ ] **Step 6: Запустить transition/event tests**

Run:

```bash
npm test -- --runInBand lib/matching/__tests__/session-transition.test.ts lib/matching/__tests__/public-session-state.test.ts lib/matching/__tests__/matching-event-display.test.ts
```

Expected: PASS.

### Task 5: Восстановить MatchingHeader без legacy

**Files:**
- Create: `components/nd/MatchingHeader.tsx`
- Create: `components/nd/MatchingHeader.test.tsx`
- Modify: `components/nd/MatchingRealtimeClient.tsx`
- Modify: `components/nd/MatchingRealtimeClient.test.tsx`

- [ ] **Step 1: Написать component test контракта шапки**

```tsx
render(<MatchingHeader
  session={session}
  viewer={viewer}
  participants={participants}
  isAdmin={false}
  isImpersonating={false}
  onLeave={onLeave}
/>)
expect(screen.getByRole('link', { name: 'На каталог' })).toHaveAttribute('href', '/')
expect(screen.getByText('Группы 3–4')).toBeVisible()
expect(screen.getByText(/Дедлайн/)).toBeVisible()
expect(screen.getByRole('button', { name: /Участники/ })).toBeVisible()
expect(screen.getByRole('button', { name: 'Покинуть' })).toBeVisible()
expect(screen.queryByText(/Лента/)).toBeNull()
expect(screen.queryByText(/Режим:/)).toBeNull()
```

- [ ] **Step 2: Реализовать safe props**

```ts
interface HeaderParticipant {
  ref: string
  displayName: string
  online: boolean
}
```

- [ ] **Step 3: Реализовать leave с подтверждением и reload-предсказуемым переходом**

```ts
const res = await fetch(`/api/matching/sessions/${sessionId}/leave`, { method: 'DELETE' })
if (!res.ok) setError('Не удалось покинуть сессию')
else window.location.assign('/matching')
```

- [ ] **Step 4: RealtimeClient хранит participants и применяет online refs из heartbeat**

```ts
setState(current => ({
  ...current,
  participants: current.participants.map(p => ({ ...p, online: onlineRefs.has(p.ref) })),
}))
```

- [ ] **Step 5: Запустить component tests**

Run:

```bash
npm test -- --runInBand components/nd/MatchingHeader.test.tsx components/nd/MatchingRealtimeClient.test.tsx
```

Expected: PASS.

### Task 6: Восстановить одноколоночный workspace и убрать пустой viewport

**Files:**
- Create: `components/nd/MatchingWorkspace.tsx`
- Create: `components/nd/MatchingWorkspace.test.tsx`
- Modify: `components/nd/MatchingSatisfactionFlow.tsx`
- Modify: `app/matching/page.tsx`

- [ ] **Step 1: Написать component test композиции**

```tsx
render(<MatchingWorkspace scenarios={<div data-testid="scenarios" />} />)
expect(screen.getByRole('heading', { name: /Сценарии/ })).toBeVisible()
expect(screen.getByTestId('matching-scenarios-scroll')).toHaveStyle({ overflowY: 'auto' })
expect(screen.getByTestId('matching-scenarios-fade')).toBeInTheDocument()
```

- [ ] **Step 2: Подключить pending loader**

```tsx
const { pending } = useMatchingBoard()
return <section aria-busy={pending}>{pending && <BoardPanelLoader />}{scenarios}</section>
```

- [ ] **Step 3: Вернуть единый flow-slot composition в page**

```tsx
<MatchingSatisfactionFlow
  phase="board"
  header={<MatchingHeader {...headerProps} />}
  workspace={<MatchingWorkspace><MatchingRealtimeClient {...props} /></MatchingWorkspace>}
  catalogIntro={<CatalogIntro />}
  {...catalogProps}
/>
```

- [ ] **Step 4: Удалить отдельный bare board и не передавать пустые header/workspace**

Проверить, что `app/matching/page.tsx` содержит ровно один `MatchingRealtimeClient` и один `MatchingSatisfactionFlow`.

- [ ] **Step 5: Запустить tests**

Run:

```bash
npm test -- --runInBand components/nd/MatchingWorkspace.test.tsx components/nd/MatchingSatisfactionFlow.test.tsx
```

Expected: PASS.

### Task 7: Вернуть high-fidelity сценарии, обложки и popup

**Files:**
- Modify: `components/nd/MatchingScenarios.tsx`
- Modify: `components/nd/MatchingScenarios.test.tsx`
- Modify: `components/nd/ParticipantInterestChip.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Написать test карточки сценария**

```tsx
expect(screen.getByText('средний ранг 1.5')).toBeVisible()
expect(screen.getByText('охват 2 из 3')).toBeVisible()
expect(screen.getByText(/За бортом остаются/)).toBeVisible()
expect(screen.getByAltText('Обложка: Книга')).toBeVisible()
expect(screen.getByText('Анна')).toHaveAttribute('title', expect.stringContaining('ранг 1'))
expect(screen.queryByText(/лучший|оптимальный/i)).toBeNull()
```

- [ ] **Step 2: Написать test открытия popup**

```tsx
fireEvent.click(screen.getByRole('button', { name: 'Книга' }))
expect(openBook).toHaveBeenCalledWith(
  expect.objectContaining({ bookId: 'b1' }),
  expect.any(Array),
)
```

- [ ] **Step 3: Передать book metadata вместо одного title map**

```ts
interface ScenarioBookMeta {
  bookId: string
  title: string
  author: string
  coverUrl: string | null
  description: string
}
```

- [ ] **Step 4: Реализовать grid кругов и presentation fields**

```tsx
<div className="nd-scenario-circles" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))' }}>
  {scenario.circles.map(circle => <ScenarioCircleCard key={circle.circleKey} {...circleProps} />)}
</div>
```

- [ ] **Step 5: Добавить desktop/touch CTA CSS**

```css
.nd-circle-cta { opacity: 0; transform: translateY(4px); pointer-events: none; }
.nd-scenario-circle:hover .nd-circle-cta,
.nd-scenario-circle:focus-within .nd-circle-cta { opacity: 1; transform: none; pointer-events: auto; }
@media (hover: none), (pointer: coarse) { .nd-circle-cta { opacity: 1; transform: none; pointer-events: auto; } }
@media (prefers-reduced-motion: reduce) { .nd-circle-cta { transition: none; transform: none; } }
```

- [ ] **Step 6: Разделить provisional и success styles**

Waiting: `var(--accent)`/`var(--accent-soft)`. Locked: `var(--success)`/`var(--bg-tag-green)`.

- [ ] **Step 7: Запустить component tests**

Run:

```bash
npm test -- --runInBand components/nd/MatchingScenarios.test.tsx components/nd/ParticipantInterestChip.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit board restoration**

```bash
git add app/matching components/nd app/globals.css
git commit -m "feat: restore matching board presentation"
```

### Task 8: Сделать собственный locked circle основным результатом observer

**Files:**
- Modify: `components/nd/MatchingLockedCircles.tsx`
- Modify: `components/nd/MatchingLockedCircles.test.tsx`
- Modify: `components/nd/MatchingRealtimeClient.tsx`

- [ ] **Step 1: Написать observer component test**

```tsx
expect(screen.getByRole('heading', { name: 'Ваш круг' })).toBeVisible()
expect(screen.getByText('Все участники подтвердили состав')).toBeVisible()
expect(screen.getByText(/больше не участвуете в расчётах/)).toBeVisible()
expect(screen.getByAltText(/Обложка/)).toBeVisible()
expect(screen.queryByText(/Telegram/i)).toBeNull()
```

- [ ] **Step 2: Разделить own circle и registry**

```ts
const ownCircle = circles.find(circle => circle.id === viewerLockedCircleId) ?? null
const otherCircles = circles.filter(circle => circle.id !== viewerLockedCircleId)
```

- [ ] **Step 3: Подключить BookDetailProvider к locked cover/title**

Клик вызывает тот же `openBook`, что и scenario card.

- [ ] **Step 4: Проверить отсутствие participant CTA в observer mode**

```tsx
expect(screen.queryByTestId('circle-confirm-button')).toBeNull()
expect(screen.queryByTestId('circle-cancel-button')).toBeNull()
```

- [ ] **Step 5: Запустить tests**

Run:

```bash
npm test -- --runInBand components/nd/MatchingLockedCircles.test.tsx components/nd/MatchingRealtimeClient.test.tsx
```

Expected: PASS.

### Task 9: E2E onboarding, header и книжный popup

**Files:**
- Modify: `e2e/fixtures.ts`
- Modify: `e2e/matching-satisfaction.spec.ts`
- Test: `e2e/matching-satisfaction.spec.ts`

- [ ] **Step 1: Добавить fixture двух ranked participants**

Добавить в `e2e/fixtures.ts` fixture `matchingBoardFixture`, которая создаёт session, две опубликованные книги, двух пользователей, signup/ranks и возвращает `{ session, books, participantA, participantB }`. Cleanup удаляет test users/books/session через существующие test API; все данные создаются только в Neon e2e branch.

Добавить helper в `e2e/matching-satisfaction.spec.ts`:

```ts
async function rankAllActiveBooks(page: Page, bookIds: string[]) {
  const response = await page.request.patch('/api/matching/priorities', {
    data: { bookIds },
  })
  expect(response.ok()).toBe(true)
}
```

- [ ] **Step 2: E2E полного входа**

```ts
test('Welcome → ranking → полноценная доска переживает reload', async ({ page, matchingBoardFixture }) => {
  await page.goto('/matching')
  await page.getByTestId('welcome-name-input').fill('Новое имя')
  await page.getByTestId('welcome-join-button').click()
  await expect(page.getByTestId('ranking-gate')).toBeVisible()
  await rankAllActiveBooks(page, matchingBoardFixture.books.map(book => book.id))
  await page.getByTestId('ranking-gate-enter').click()
  await expect(page.getByTestId('matching-header')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('matching-header')).toContainText('Новое имя')
})
```

- [ ] **Step 3: E2E шапки и leave persistence**

```ts
await expect(page.getByRole('link', { name: 'На каталог' })).toHaveAttribute('href', '/')
await expect(page.getByRole('button', { name: /Участники/ })).toContainText('2')
page.once('dialog', dialog => dialog.accept())
await page.getByRole('button', { name: 'Покинуть' }).click()
await page.reload()
await expect(page.getByTestId('welcome-name-input')).toBeVisible()
```

- [ ] **Step 4: E2E participant popover и online heartbeat**

Открыть popover участников, выполнить `/api/matching/version` из второго context и дождаться online-dot рядом с именем второго participant. Закрыть popover, перейти по `← Каталог` и проверить URL `/`.

- [ ] **Step 5: E2E пустого списка без Ranking Gate**

Новый participant без книг проходит Welcome и сразу видит header, workspace и доступный каталог; `ranking-gate` отсутствует.

- [ ] **Step 6: E2E cover → popup**

```ts
const circle = page.getByTestId('matching-circle').first()
await expect(circle.getByRole('img', { name: /Обложка/ })).toBeVisible()
await circle.getByRole('button', { name: matchingBoardFixture.books[0].title }).click()
await expect(page.getByRole('dialog')).toContainText(matchingBoardFixture.books[0].author)
```

- [ ] **Step 7: Запустить файл**

Run:

```bash
npm run test:e2e e2e/matching-satisfaction.spec.ts
```

Expected: PASS.

### Task 10: E2E confirmation, switch, transfer и конкурентность

**Files:**
- Modify: `e2e/matching-satisfaction.spec.ts`
- Modify: `e2e/matching-realtime.spec.ts`

- [ ] **Step 1: Confirm/cancel с reload и вторым viewer**

Первый participant подтверждает, reload показывает `1 из 2 · временно`; второй context видит `✓`; отмена первого после reload убирает статус у обоих.

- [ ] **Step 2: Switch с проверкой диалога**

```ts
await secondCircle.getByTestId('circle-confirm-button').click()
const dialog = page.getByRole('dialog', { name: 'Сменить круг?' })
await expect(dialog).toContainText(firstBook.title)
await expect(dialog).toContainText(secondBook.title)
await dialog.getByRole('button', { name: 'Подтвердить' }).click()
await page.reload()
await expect(page.getByTestId('circle-waiting')).toContainText(secondBook.title)
```

- [ ] **Step 3: Automatic transfer и durable notice**

Изменить приоритет третьего participant так, чтобы исходный состав исчез, но книга осталась в другом круге. Проверить новый состав, старый и новый состав в notice, reload до ack и исчезновение только после `Понятно` + reload.

- [ ] **Step 4: Invalidation без альтернатив**

Удалить выбранную книгу у второго participant; проверить снятие confirmation и notice после reload.

- [ ] **Step 5: First-commit concurrency**

```ts
const [a, b] = await Promise.all([
  contextA.request.put(url, { data: choiceA }),
  contextB.request.put(url, { data: choiceB }),
])
expect([a.status(), b.status()].sort()).toEqual([200, 409])
```

- [ ] **Step 6: Idempotent lost-response retry**

Повторить тот же PUT с исходной `expectedStateVersion`; ожидать 200, `changed:false`, одно event.

- [ ] **Step 7: Запустить matching E2E**

Run:

```bash
npm run test:e2e e2e/matching-satisfaction.spec.ts e2e/matching-realtime.spec.ts
```

Expected: PASS.

### Task 11: E2E lock, observer и admin workflows

**Files:**
- Modify: `e2e/matching-satisfaction.spec.ts`
- Create: `e2e/matching-admin.spec.ts`

- [ ] **Step 1: Lock всех участников**

Оба participant подтверждают одинаковый circle; после reload оба видят primary `Ваш круг`, badge observer и не видят confirmation CTA.

- [ ] **Step 2: Доказать исключение observers из расчёта**

Добавить двух оставшихся active participants с другой книгой и проверить, что live scenarios не содержат имён locked participants, а locked circle остаётся неизменным.

- [ ] **Step 3: Admin add/remove guards**

Проверить disclosure warning, `joinSource=admin`, удаление active, запрет удаления observer.

- [ ] **Step 4: Full dissolve**

```ts
await row.getByTestId('dissolve-circle-btn').click()
await page.getByTestId('dissolve-reason-input').fill('Исправление тестового состава')
await page.getByTestId('dissolve-confirm-btn').click()
await expect.poll(async () => {
  const response = await page.request.get(`/api/admin/matching/sessions/${session.id}/participants`)
  const payload = await response.json() as { data: Array<{ role: string }> }
  return payload.data.map(participant => participant.role).sort()
}).toEqual(['active', 'active'])
```

После participant reload primary locked result отсутствует, оба снова участвуют в сценариях.

- [ ] **Step 5: Admin group-size и impersonation controls**

Изменить размер групп из header admin-view, проверить сохранение после reload и событие `change_group_size`. Открыть participant через impersonation, проверить явный banner и ссылку возврата в обычный admin-view.

- [ ] **Step 6: Freeze snapshot**

Проверить clearing provisional confirmations, participant read-only UI, отсутствие CTA и admin remaining snapshot без названия «подтверждённый круг».

- [ ] **Step 7: Запустить admin E2E**

Run:

```bash
npm run test:e2e e2e/matching-admin.spec.ts
```

Expected: PASS.

### Task 12: E2E matching analytics, audit и heartbeat

**Files:**
- Create: `e2e/matching-audit.spec.ts`
- Modify: `e2e/fixtures.ts`

- [ ] **Step 1: Создать semantic mutation sequence**

Выполнить self join с изменением имени, confirm, cancel, switch, automatic transfer, lock, dissolve и freeze.

- [ ] **Step 2: Проверить matching analytics**

```ts
const analytics = await admin.request.get(`/api/admin/matching/preference-events?sessionId=${session.id}`)
const payload = await analytics.json() as { events: Array<{ eventType: string }> }
expect(payload.events.map(event => event.eventType)).toEqual(expect.arrayContaining([
  'self_join', 'welcome_name_changed', 'confirmation_created',
  'confirmation_cancelled', 'confirmation_switched',
  'confirmation_transferred', 'circle_locked', 'circle_dissolved', 'freeze',
]))
```

- [ ] **Step 3: Проверить global audit**

Запросить admin audit API и проверить actor/source для matching tables и `users.name` before/after.

- [ ] **Step 4: Доказать отсутствие heartbeat noise**

Снять число audit rows для participant, выполнить три `/api/matching/version`, повторить запрос и ожидать то же число row-level событий для чистого `last_seen_at`.

- [ ] **Step 5: Запустить audit E2E**

Run:

```bash
npm run test:e2e e2e/matching-audit.spec.ts
```

Expected: PASS.

### Task 13: Вторичные layout E2E

**Files:**
- Modify: `e2e/ui-states.spec.ts`

- [ ] **Step 1: Проверить отсутствие пустого viewport**

```ts
const workspace = await page.getByTestId('matching-workspace').boundingBox()
const catalog = await page.getByTestId('matching-catalog-panel').boundingBox()
expect(catalog!.y - (workspace!.y + workspace!.height)).toBeLessThan(48)
```

- [ ] **Step 2: Desktop hover и keyboard focus**

В покое CTA имеет `opacity:0`; после hover или `Tab` — `opacity:1` и принимает click.

- [ ] **Step 3: Touch CTA**

В mobile context с `hasTouch:true` CTA видима без hover.

- [ ] **Step 4: Scroll и observer layout**

Проверить, что scenario body имеет собственный scroll, registry находится выше live scenarios, а переход в observer не меняет ширину workspace.

- [ ] **Step 5: Запустить layout E2E**

Run:

```bash
npm run test:e2e e2e/ui-states.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit E2E suite**

```bash
git add e2e
git commit -m "test: cover matching user journeys end to end"
```

### Task 14: Обновить документацию и выполнить полную приёмку

**Files:**
- Modify: `docs/features/matching.md`
- Modify: `docs/features/testing.md`
- Modify: `docs/wiki/Group-Matching-Mode.md`
- Modify: `docs/wiki/Privacy-and-User-Data.md`
- Modify: `public/openapi.json`

- [ ] **Step 1: Обновить technical docs**

Описать presentation DTO, header/workspace, popup integration, observer primary result, notice snapshots и E2E fixtures.

- [ ] **Step 2: Обновить Wiki**

Зафиксировать восстановленный пользовательский flow, реальные имена, временное подтверждение, observer и отсутствие Telegram CTA.

- [ ] **Step 3: Runtime regression scan**

Run:

```bash
rg -n 'optimizationMode|pseudonym|MatchingMyMoves|MatchingFeedTicker|coverage' app/matching components/nd lib/matching --glob '*.{ts,tsx}'
```

Expected: no runtime legacy hits.

- [ ] **Step 4: Полная локальная проверка**

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run test:e2e e2e/matching-satisfaction.spec.ts e2e/matching-realtime.spec.ts e2e/matching-admin.spec.ts e2e/matching-audit.spec.ts e2e/ui-states.spec.ts
npm run build
```

Expected: all PASS.

- [ ] **Step 5: Проверить production-like UX вручную**

Через in-app browser пройти Welcome → Ranking Gate → board → popup → confirm → observer; отдельно проверить admin dissolve/freeze и журналы.

- [ ] **Step 6: Финальный commit**

```bash
git add docs public/openapi.json
git commit -m "docs: describe restored matching experience"
```

- [ ] **Step 7: PR flow и CI gate**

```bash
git push -u origin codex/matching-ui-restoration
gh pr create --fill
gh pr merge --auto --squash --delete-branch
gh pr view --json mergeStateStatus,mergeable
```

При `BEHIND` выполнить `gh pr update-branch`; при CI failure исправлять в той же PR-ветке. Работа завершена только после merge в `main` и production smoke-check.

## Final acceptance matrix

- [ ] Header содержит navigation, metadata, viewer identity, participants/online и leave.
- [ ] Feed, mode selector, pseudonyms, My Moves, coverage и Telegram CTA отсутствуют.
- [ ] Scenarios содержат metrics, left-out, cover, author, ranks и popup.
- [ ] Первый сценарий визуально не выделен.
- [ ] Provisional и locked состояния различимы.
- [ ] Confirmation/cancel/switch/transfer/invalidation переживают reload.
- [ ] Observer исключён из расчётов и видит primary own circle.
- [ ] Admin add/remove/dissolve/freeze работают и покрыты E2E.
- [ ] Matching analytics и global audit содержат смысловые изменения; heartbeat отсутствует.
- [ ] Participant API/RSC не содержат raw user IDs.
- [ ] Functional E2E проверяют пользовательские исходы; layout tests остаются дополнительными.
