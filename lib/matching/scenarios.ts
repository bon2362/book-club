export interface ScenarioParticipant {
  userId: string
  pseudonym: string
}

export interface ScenarioBook {
  bookId: string
}

export interface ScenarioSignup {
  userId: string
  bookId: string
}

export interface ScenarioRank {
  userId: string
  bookId: string
  rank: number | null
}

export type OptimizationMode = 'coverage' | 'satisfaction'

export interface GroupMember {
  userId: string
  pseudonym: string
  rank: number | null
  interest: 'очень хочу' | 'хочу' | 'без ранга'
}

export interface ScenarioCard {
  bookId: string
  tier: 'leader' | 'max-coverage' | 'sub-max'
  members: GroupMember[]
  wantsCount: number
  avgRank: number | null
  worstRank: number | null
  unrankedCount: number
}

export interface ScenarioCandidate extends ScenarioCard {
  inCurrentLayout: boolean
  conflictsWith: string[]
}

export interface ScenarioOverview {
  current: ScenarioCard[]
  candidates: ScenarioCandidate[]
  leftOut: ScenarioParticipant[]
  coveredCount: number
  totalCount: number
  minGroupSize: number
  maxGroupSize: number
  mode: OptimizationMode
}

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
  mode: OptimizationMode
}

export interface GenerateScenariosInput {
  participants: ScenarioParticipant[]
  books: ScenarioBook[]
  signups: ScenarioSignup[]
  ranks: ScenarioRank[]
  minGroupSize: number
  maxGroupSize: number
  maxResults?: number
  mode?: OptimizationMode
}

interface CircleState {
  circles: MatchingCircle[]
  usedBookIds: Set<string>
  usedUserIds: Set<string>
}

const MAX_CIRCLES_PER_BOOK = 24
const MAX_TOTAL_CIRCLES = 900
const BEAM_WIDTH = 50
const EXHAUSTIVE_COMBINATION_LIMIT = 5_000
const TOP_LOCAL_CIRCLES_PER_BOOK = 12

function interest(rank: number | null): GroupMember['interest'] {
  if (rank === null) return 'без ранга'
  if (rank <= 3) return 'очень хочу'
  return 'хочу'
}

function scoreMembers(members: GroupMember[]): {
  wantsCount: number
  avgRank: number | null
  worstRank: number | null
  unrankedCount: number
  rankedCount: number
  rankSum: number
} {
  const ranked = members.filter((m) => m.rank !== null)
  const rankSum = ranked.reduce((sum, m) => sum + m.rank!, 0)
  const unrankedCount = members.length - ranked.length
  const wantsCount = ranked.filter((m) => m.rank! <= 3).length
  const avgRank = ranked.length > 0 ? rankSum / ranked.length : null
  const worstRank = ranked.length > 0 ? Math.max(...ranked.map((m) => m.rank!)) : null
  return { wantsCount, avgRank, worstRank, unrankedCount, rankedCount: ranked.length, rankSum }
}

function compareNullableRankAsc(a: number | null, b: number | null): number {
  return (a ?? Infinity) - (b ?? Infinity)
}

// Positive means a is better than b.
function compareCircleScore(a: MatchingCircle, b: MatchingCircle): number {
  if (a.wantsCount !== b.wantsCount) return a.wantsCount - b.wantsCount
  const avg = compareNullableRankAsc(a.avgRank, b.avgRank)
  if (avg !== 0) return -avg
  const worst = compareNullableRankAsc(a.worstRank, b.worstRank)
  if (worst !== 0) return -worst
  if (a.unrankedCount !== b.unrankedCount) return b.unrankedCount - a.unrankedCount
  return b.id.localeCompare(a.id)
}

// Positive means a is better than b.
function compareScenarioScore(a: Pick<MatchingScenario, 'id' | 'score'>, b: Pick<MatchingScenario, 'id' | 'score'>): number {
  if (a.score.coveredCount !== b.score.coveredCount) return a.score.coveredCount - b.score.coveredCount
  if (a.score.strongInterestCount !== b.score.strongInterestCount) {
    return a.score.strongInterestCount - b.score.strongInterestCount
  }
  const avg = compareNullableRankAsc(a.score.avgRank, b.score.avgRank)
  if (avg !== 0) return -avg
  const worst = compareNullableRankAsc(a.score.worstRank, b.score.worstRank)
  if (worst !== 0) return -worst
  if (a.score.unrankedCount !== b.score.unrankedCount) return b.score.unrankedCount - a.score.unrankedCount
  return b.id.localeCompare(a.id)
}

// Positive means a is better than b in satisfaction mode.
export function compareCircleSatisfaction(a: MatchingCircle, b: MatchingCircle): number {
  const avg = compareNullableRankAsc(a.avgRank, b.avgRank)
  if (avg !== 0) return -avg
  const worst = compareNullableRankAsc(a.worstRank, b.worstRank)
  if (worst !== 0) return -worst
  if (a.members.length !== b.members.length) return a.members.length - b.members.length
  return b.id.localeCompare(a.id)
}

// Positive means a is better than b in satisfaction mode.
export function compareScenarioSatisfaction(
  a: Pick<MatchingScenario, 'id' | 'circles' | 'score'>,
  b: Pick<MatchingScenario, 'id' | 'circles' | 'score'>,
): number {
  const aCircles = [...a.circles].sort((x, y) => compareCircleSatisfaction(y, x))
  const bCircles = [...b.circles].sort((x, y) => compareCircleSatisfaction(y, x))
  const len = Math.max(aCircles.length, bCircles.length)

  for (let i = 0; i < len; i++) {
    const ca = aCircles[i]
    const cb = bCircles[i]
    if (ca && cb) {
      const circleScore = compareCircleSatisfaction(ca, cb)
      if (circleScore !== 0) return circleScore
    } else if (ca && !cb) {
      return 1
    } else if (!ca && cb) {
      return -1
    }
  }

  const avg = compareNullableRankAsc(a.score.avgRank, b.score.avgRank)
  if (avg !== 0) return -avg
  if (a.score.strongInterestCount !== b.score.strongInterestCount) {
    return a.score.strongInterestCount - b.score.strongInterestCount
  }
  return b.id.localeCompare(a.id)
}

function circleComparator(mode: OptimizationMode) {
  return mode === 'satisfaction' ? compareCircleSatisfaction : compareCircleScore
}

function scenarioComparator(mode: OptimizationMode) {
  return mode === 'satisfaction' ? compareScenarioSatisfaction : compareScenarioScore
}

export function filterSignupsByMode(
  signups: ScenarioSignup[],
  ranks: ScenarioRank[],
  mode: OptimizationMode,
): ScenarioSignup[] {
  if (mode !== 'satisfaction') return signups
  const ranked = new Set(
    ranks
      .filter((rank) => rank.rank !== null)
      .map((rank) => `${rank.userId}:${rank.bookId}`),
  )
  return signups.filter((signup) => ranked.has(`${signup.userId}:${signup.bookId}`))
}

function memberSortKey(member: GroupMember): string {
  const rank = String(member.rank ?? 9999).padStart(4, '0')
  return `${rank}:${member.pseudonym}:${member.userId}`
}

function buildCircleId(bookId: string, members: GroupMember[]): string {
  return `${bookId}:${members.map((m) => m.userId).sort().join('+')}`
}

function toMember(userId: string, bookId: string, pseudonymMap: Map<string, string>, rankMap: Map<string, number | null>): GroupMember {
  const rank = rankMap.get(`${userId}:${bookId}`) ?? null
  return {
    userId,
    pseudonym: pseudonymMap.get(userId) ?? userId,
    rank,
    interest: interest(rank),
  }
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size <= 0 || items.length < size) return []
  const result: T[][] = []
  const current: T[] = []

  function walk(start: number) {
    if (current.length === size) {
      result.push([...current])
      return
    }
    const needed = size - current.length
    for (let i = start; i <= items.length - needed; i++) {
      current.push(items[i])
      walk(i + 1)
      current.pop()
    }
  }

  walk(0)
  return result
}

function combinationCount(n: number, k: number): number {
  if (k < 0 || k > n) return 0
  const size = Math.min(k, n - k)
  let count = 1
  for (let i = 1; i <= size; i++) {
    count = (count * (n - size + i)) / i
    if (count > EXHAUSTIVE_COMBINATION_LIMIT) return count
  }
  return count
}

function memberGroupId(members: GroupMember[]): string {
  return members.map((m) => m.userId).sort().join('+')
}

function buildMemberGroupsForSize(members: GroupMember[], groupSize: number): GroupMember[][] {
  const totalCombinations = combinationCount(members.length, groupSize)
  if (totalCombinations <= EXHAUSTIVE_COMBINATION_LIMIT) {
    return combinations(members, groupSize)
  }

  const groups = new Map<string, GroupMember[]>()
  const addGroup = (group: GroupMember[]) => {
    if (group.length !== groupSize) return
    groups.set(memberGroupId(group), group)
  }

  addGroup(members.slice(0, groupSize))

  for (let offset = 0; offset < groupSize; offset++) {
    for (let start = offset; start + groupSize <= members.length; start += groupSize) {
      addGroup(members.slice(start, start + groupSize))
    }
  }

  for (const anchor of members) {
    const group = [anchor]
    for (const candidate of members) {
      if (candidate.userId === anchor.userId) continue
      group.push(candidate)
      if (group.length === groupSize) break
    }
    addGroup(group)
  }

  return Array.from(groups.values())
}

function buildMemberGroups(members: GroupMember[], minGroupSize: number, maxGroupSize: number): GroupMember[][] {
  const groups = new Map<string, GroupMember[]>()
  const upper = Math.min(maxGroupSize, members.length)
  for (let size = minGroupSize; size <= upper; size++) {
    for (const group of buildMemberGroupsForSize(members, size)) {
      groups.set(memberGroupId(group), group)
    }
  }
  return Array.from(groups.values())
}

function memberOverlap(a: MatchingCircle, b: MatchingCircle): number {
  const aIds = new Set(a.members.map((m) => m.userId))
  return b.members.filter((m) => aIds.has(m.userId)).length
}

function maxOverlapWithSelected(circle: MatchingCircle, selected: MatchingCircle[]): number {
  if (selected.length === 0) return 0
  return Math.max(...selected.map((candidate) => memberOverlap(circle, candidate)))
}

function selectDiverseCircles(circles: MatchingCircle[], maxGroupSize: number, mode: OptimizationMode): MatchingCircle[] {
  const compare = circleComparator(mode)
  const sorted = [...circles].sort((a, b) => compare(b, a))
  const selected: MatchingCircle[] = []
  const selectedIds = new Set<string>()

  const add = (circle: MatchingCircle) => {
    if (selectedIds.has(circle.id) || selected.length >= MAX_CIRCLES_PER_BOOK) return
    selected.push(circle)
    selectedIds.add(circle.id)
  }

  for (const circle of sorted.slice(0, TOP_LOCAL_CIRCLES_PER_BOOK)) add(circle)

  for (let allowedOverlap = 0; allowedOverlap < maxGroupSize && selected.length < MAX_CIRCLES_PER_BOOK; allowedOverlap++) {
    for (const circle of sorted) {
      if (selectedIds.has(circle.id)) continue
      if (maxOverlapWithSelected(circle, selected) <= allowedOverlap) add(circle)
      if (selected.length >= MAX_CIRCLES_PER_BOOK) break
    }
  }

  for (const circle of sorted) {
    add(circle)
    if (selected.length >= MAX_CIRCLES_PER_BOOK) break
  }

  return selected.sort((a, b) => compare(b, a))
}

function buildCandidateCircles(input: GenerateScenariosInput): MatchingCircle[] {
  const { participants, books, signups, ranks, minGroupSize, maxGroupSize } = input
  const mode = input.mode ?? 'coverage'
  if (minGroupSize < 1 || maxGroupSize < minGroupSize || participants.length < minGroupSize) return []

  const pseudonymMap = new Map(participants.map((p) => [p.userId, p.pseudonym]))
  const participantIds = new Set(participants.map((p) => p.userId))
  const rankMap = new Map(ranks.map((r) => [`${r.userId}:${r.bookId}`, r.rank] as const))
  const bookIds = new Set(books.map((b) => b.bookId))
  const signupsByBook = new Map<string, Set<string>>()

  for (const signup of signups) {
    if (!bookIds.has(signup.bookId) || !participantIds.has(signup.userId)) continue
    const userIds = signupsByBook.get(signup.bookId) ?? new Set<string>()
    userIds.add(signup.userId)
    signupsByBook.set(signup.bookId, userIds)
  }

  const allCircles: MatchingCircle[] = []
  for (const book of books) {
    const userIds = Array.from(signupsByBook.get(book.bookId) ?? [])
    if (userIds.length < minGroupSize) continue

    const members = userIds
      .map((userId) => toMember(userId, book.bookId, pseudonymMap, rankMap))
      .sort((a, b) => memberSortKey(a).localeCompare(memberSortKey(b)))

    const circles = buildMemberGroups(members, minGroupSize, maxGroupSize)
      .map((circleMembers): MatchingCircle => {
        const score = scoreMembers(circleMembers)
        return {
          id: buildCircleId(book.bookId, circleMembers),
          bookId: book.bookId,
          members: circleMembers,
          minSize: minGroupSize,
          maxSize: maxGroupSize,
          wantsCount: score.wantsCount,
          avgRank: score.avgRank,
          worstRank: score.worstRank,
          unrankedCount: score.unrankedCount,
        }
      })

    allCircles.push(...selectDiverseCircles(circles, maxGroupSize, mode))
  }

  const compare = circleComparator(mode)
  return allCircles
    .sort((a, b) => compare(b, a))
    .slice(0, MAX_TOTAL_CIRCLES)
}

function scenarioId(circles: MatchingCircle[]): string {
  return circles.map((circle) => circle.id).sort().join('|')
}

function scoreScenario(circles: MatchingCircle[], totalCount: number): ScenarioScore {
  const members = circles.flatMap((circle) => circle.members)
  const ranked = members.filter((m) => m.rank !== null)
  const rankSum = ranked.reduce((sum, m) => sum + m.rank!, 0)
  const coveredCount = new Set(members.map((m) => m.userId)).size
  return {
    coveredCount,
    totalCount,
    coverageRatio: totalCount > 0 ? coveredCount / totalCount : 0,
    strongInterestCount: ranked.filter((m) => m.rank! <= 3).length,
    rankedCount: ranked.length,
    unrankedCount: members.length - ranked.length,
    rankSum,
    avgRank: ranked.length > 0 ? rankSum / ranked.length : null,
    worstRank: ranked.length > 0 ? Math.max(...ranked.map((m) => m.rank!)) : null,
  }
}

function toScenario(
  circles: MatchingCircle[],
  participants: ScenarioParticipant[],
  tier: MatchingScenario['tier'],
): MatchingScenario {
  const usedUserIds = new Set(circles.flatMap((circle) => circle.members.map((m) => m.userId)))
  return {
    id: scenarioId(circles),
    tier,
    circles,
    leftOut: participants.filter((p) => !usedUserIds.has(p.userId)),
    score: scoreScenario(circles, participants.length),
  }
}

function canAddCircle(state: CircleState, circle: MatchingCircle): boolean {
  if (state.usedBookIds.has(circle.bookId)) return false
  return circle.members.every((member) => !state.usedUserIds.has(member.userId))
}

function addCircle(state: CircleState, circle: MatchingCircle): CircleState {
  return {
    circles: [...state.circles, circle],
    usedBookIds: new Set(state.usedBookIds).add(circle.bookId),
    usedUserIds: new Set([...Array.from(state.usedUserIds), ...circle.members.map((m) => m.userId)]),
  }
}

function compareStates(a: CircleState, b: CircleState, totalCount: number, mode: OptimizationMode): number {
  const aScenario = { id: scenarioId(a.circles), circles: a.circles, score: scoreScenario(a.circles, totalCount) }
  const bScenario = { id: scenarioId(b.circles), circles: b.circles, score: scoreScenario(b.circles, totalCount) }
  return scenarioComparator(mode)(aScenario, bScenario)
}

function buildScenarioStates(circles: MatchingCircle[], participants: ScenarioParticipant[], mode: OptimizationMode): CircleState[] {
  const empty: CircleState = { circles: [], usedBookIds: new Set(), usedUserIds: new Set() }
  let states: CircleState[] = [empty]

  for (const circle of circles) {
    const additions: CircleState[] = []
    for (const state of states) {
      if (canAddCircle(state, circle)) additions.push(addCircle(state, circle))
    }

    const byId = new Map<string, CircleState>()
    for (const state of [...states, ...additions]) {
      byId.set(scenarioId(state.circles), state)
    }

    const emptyState = byId.get('') ?? empty
    const rankedStates = Array.from(byId.values())
      .filter((state) => state.circles.length > 0)
      .sort((a, b) => compareStates(b, a, participants.length, mode))
      .slice(0, BEAM_WIDTH)

    states = [emptyState, ...rankedStates]
  }

  return states.filter((state) => state.circles.length > 0)
}

function isStrictCircleSubset(a: MatchingScenario, b: MatchingScenario): boolean {
  if (a.circles.length >= b.circles.length) return false
  const bCircleIds = new Set(b.circles.map((circle) => circle.id))
  return a.circles.every((circle) => bCircleIds.has(circle.id))
}

function filterDominatedSatisfactionScenarios(scenarios: MatchingScenario[]): MatchingScenario[] {
  return scenarios.filter((scenario, index) => (
    !scenarios.some((other, otherIndex) => otherIndex !== index && isStrictCircleSubset(scenario, other))
  ))
}

function assignScenarioTiers(scenarios: MatchingScenario[], totalCount: number, mode: OptimizationMode): MatchingScenario[] {
  if (scenarios.length === 0) return []
  if (mode === 'satisfaction') {
    return scenarios.map((scenario, index) => ({
      ...scenario,
      tier: index === 0 ? 'leader' : 'partial',
    }))
  }
  const bestPartialCoverage = Math.max(
    0,
    ...scenarios
      .filter((scenario) => scenario.score.coveredCount < totalCount)
      .map((scenario) => scenario.score.coveredCount),
  )

  return scenarios.map((scenario, index) => {
    let tier: MatchingScenario['tier']
    if (index === 0) tier = 'leader'
    else if (scenario.score.coveredCount === totalCount) tier = 'full-coverage'
    else if (scenario.score.coveredCount === bestPartialCoverage) tier = 'best-achievable-partial'
    else tier = 'partial'
    return { ...scenario, tier }
  })
}

export function emptyScenarioSetOverview(
  participants: ScenarioParticipant[],
  minGroupSize: number,
  maxGroupSize = minGroupSize,
  mode: OptimizationMode = 'coverage',
): ScenarioSetOverview {
  return {
    scenarios: [],
    leader: null,
    totalCount: participants.length,
    minGroupSize,
    maxGroupSize,
    mode,
  }
}

export function generateScenarioSets(input: GenerateScenariosInput): ScenarioSetOverview {
  const mode = input.mode ?? 'coverage'
  const { participants, minGroupSize, maxGroupSize } = input
  const maxResults = input.maxResults ?? (mode === 'coverage' ? 10 : null)
  if (participants.length < minGroupSize || minGroupSize < 1 || maxGroupSize < minGroupSize) {
    return emptyScenarioSetOverview(participants, minGroupSize, maxGroupSize, mode)
  }

  const candidateCircles = buildCandidateCircles(input)
  if (candidateCircles.length === 0) {
    return emptyScenarioSetOverview(participants, minGroupSize, maxGroupSize, mode)
  }

  const compare = scenarioComparator(mode)
  const scenarios = buildScenarioStates(candidateCircles, participants, mode)
    .map((state) => toScenario(state.circles, participants, 'partial'))
    .sort((a, b) => compare(b, a))

  const visibleScenarios = mode === 'satisfaction' ? filterDominatedSatisfactionScenarios(scenarios) : scenarios
  const resultScenarios = maxResults === null ? visibleScenarios : visibleScenarios.slice(0, maxResults)

  const tiered = assignScenarioTiers(resultScenarios, participants.length, mode)
  return {
    scenarios: tiered,
    leader: tiered[0] ?? null,
    totalCount: participants.length,
    minGroupSize,
    maxGroupSize,
    mode,
  }
}

function toScenarioCard(circle: MatchingCircle, tier: ScenarioCard['tier']): ScenarioCard {
  return {
    bookId: circle.bookId,
    tier,
    members: circle.members,
    wantsCount: circle.wantsCount,
    avgRank: circle.avgRank,
    worstRank: circle.worstRank,
    unrankedCount: circle.unrankedCount,
  }
}

function hasSameMembers(a: Pick<ScenarioCard, 'members'>, b: Pick<ScenarioCard, 'members'>): boolean {
  if (a.members.length !== b.members.length) return false
  const aIds = new Set(a.members.map((m) => m.userId))
  return b.members.every((m) => aIds.has(m.userId))
}

export function emptyScenarioOverview(
  participants: ScenarioParticipant[],
  minGroupSize: number,
  maxGroupSize = minGroupSize,
  mode: OptimizationMode = 'coverage',
): ScenarioOverview {
  return {
    current: [],
    candidates: [],
    leftOut: participants,
    coveredCount: 0,
    totalCount: participants.length,
    minGroupSize,
    maxGroupSize,
    mode,
  }
}

export function generateScenarioOverview(input: GenerateScenariosInput): ScenarioOverview {
  const mode = input.mode ?? 'coverage'
  const scenarioSets = generateScenarioSets(input)
  const leader = scenarioSets.leader
  if (!leader) return emptyScenarioOverview(input.participants, input.minGroupSize, input.maxGroupSize, mode)

  const current = leader.circles.map((circle, index) => {
    if (index === 0) return toScenarioCard(circle, 'leader')
    return toScenarioCard(circle, circle.wantsCount === leader.circles[0].wantsCount ? 'max-coverage' : 'sub-max')
  })
  const currentUserIds = new Set(current.flatMap((card) => card.members.map((m) => m.userId)))

  const candidates: ScenarioCandidate[] = []
  const candidateIds = new Set<string>()
  for (const circle of buildCandidateCircles(input)) {
    if (candidateIds.has(circle.id)) continue
    candidateIds.add(circle.id)
    const card = toScenarioCard(circle, 'sub-max')
    const currentMatch = current.find((currentCard) => (
      currentCard.bookId === card.bookId && hasSameMembers(currentCard, card)
    ))
    const overlapsCurrentLayout = card.members.filter((m) => currentUserIds.has(m.userId))
    candidates.push({
      ...card,
      tier: currentMatch?.tier ?? 'sub-max',
      inCurrentLayout: currentMatch !== undefined,
      conflictsWith: currentMatch ? [] : overlapsCurrentLayout.map((m) => m.pseudonym),
    })
  }

  return {
    current,
    candidates,
    leftOut: leader.leftOut,
    coveredCount: leader.score.coveredCount,
    totalCount: input.participants.length,
    minGroupSize: input.minGroupSize,
    maxGroupSize: input.maxGroupSize,
    mode,
  }
}

export function generateScenarios(input: GenerateScenariosInput): ScenarioCard[] {
  return generateScenarioOverview(input).current.slice(0, input.maxResults ?? 10)
}
