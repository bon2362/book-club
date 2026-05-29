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

export interface GroupMember {
  userId: string
  pseudonym: string
  rank: number | null
  interest: 'хочу читать' | 'готов(а)' | 'без ранга'
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

export interface GenerateScenariosInput {
  participants: ScenarioParticipant[]
  books: ScenarioBook[]
  signups: ScenarioSignup[]
  ranks: ScenarioRank[]
  targetGroupSize: number
  maxResults?: number
}

function interest(rank: number | null): GroupMember['interest'] {
  if (rank === null) return 'без ранга'
  if (rank <= 3) return 'хочу читать'
  return 'готов(а)'
}

function scoreCandidates(members: GroupMember[]): {
  wantsCount: number
  avgRank: number | null
  worstRank: number | null
  unrankedCount: number
} {
  const ranked = members.filter(m => m.rank !== null)
  const unrankedCount = members.length - ranked.length
  const wantsCount = members.filter(m => m.rank !== null && m.rank <= 3).length
  const avgRank = ranked.length > 0 ? ranked.reduce((s, m) => s + m.rank!, 0) / ranked.length : null
  const worstRank = ranked.length > 0 ? Math.max(...ranked.map(m => m.rank!)) : null
  return { wantsCount, avgRank, worstRank, unrankedCount }
}

// Compare two cards: higher is better
// Returns negative if a < b (b is better), positive if a > b (a is better)
function compareScore(
  a: { wantsCount: number; avgRank: number | null; worstRank: number | null; unrankedCount: number },
  b: { wantsCount: number; avgRank: number | null; worstRank: number | null; unrankedCount: number },
): number {
  if (b.wantsCount !== a.wantsCount) return a.wantsCount - b.wantsCount
  // Lower avgRank is better; null ranks are worst
  const aAvg = a.avgRank ?? Infinity
  const bAvg = b.avgRank ?? Infinity
  if (aAvg !== bAvg) return bAvg - aAvg
  const aWorst = a.worstRank ?? Infinity
  const bWorst = b.worstRank ?? Infinity
  if (aWorst !== bWorst) return bWorst - aWorst
  return b.unrankedCount - a.unrankedCount
}

// Pick the best combination of targetGroupSize members from candidates.
// Sorts by rank (null = worst) and picks the top group using exhaustive search
// for small targetGroupSize (<=5 typical).
function pickBestGroup(
  candidates: GroupMember[],
  targetGroupSize: number,
): GroupMember[] | null {
  if (candidates.length < targetGroupSize) return null
  if (candidates.length === targetGroupSize) return candidates

  // Sort: want most хочу читать, then lowest rank, then null last
  const sorted = [...candidates].sort((a, b) => {
    const wa = a.rank !== null && a.rank <= 3 ? 0 : 1
    const wb = b.rank !== null && b.rank <= 3 ? 0 : 1
    if (wa !== wb) return wa - wb
    const ra = a.rank ?? Infinity
    const rb = b.rank ?? Infinity
    return ra - rb
  })

  // For small targetGroupSize, brute-force best combination
  if (targetGroupSize <= 5 && candidates.length <= 30) {
    let best: GroupMember[] | null = null
    let bestScore: ReturnType<typeof scoreCandidates> | null = null

    const combine = (start: number, current: GroupMember[]) => {
      if (current.length === targetGroupSize) {
        const s = scoreCandidates(current)
        if (bestScore === null || compareScore(s, bestScore) > 0) {
          best = [...current]
          bestScore = s
        }
        return
      }
      const remaining = candidates.length - start
      if (remaining < targetGroupSize - current.length) return
      for (let i = start; i < candidates.length; i++) {
        current.push(candidates[i])
        combine(i + 1, current)
        current.pop()
      }
    }
    combine(0, [])
    return best
  }

  // Greedy fallback for large inputs
  return sorted.slice(0, targetGroupSize)
}

export function generateScenarios(input: GenerateScenariosInput): ScenarioCard[] {
  const {
    participants,
    books,
    signups,
    ranks,
    targetGroupSize,
    maxResults = 10,
  } = input

  const pseudonymMap = new Map(participants.map(p => [p.userId, p.pseudonym]))

  // Build rank lookup: (userId, bookId) → rank
  const rankMap = new Map<string, number | null>()
  for (const r of ranks) {
    rankMap.set(`${r.userId}:${r.bookId}`, r.rank)
  }

  // Build signups per book
  const signupsByBook = new Map<string, string[]>()
  for (const s of signups) {
    const arr = signupsByBook.get(s.bookId) ?? []
    arr.push(s.userId)
    signupsByBook.set(s.bookId, arr)
  }

  // Candidate books: have ≥ targetGroupSize signups
  // Note: personal status filtering (reading/read) happens upstream at the call site.
  const candidateBookIds = books
    .map(b => b.bookId)
    .filter(bookId => (signupsByBook.get(bookId)?.length ?? 0) >= targetGroupSize)

  // For each candidate book, find best group and score it
  interface Candidate {
    bookId: string
    members: GroupMember[]
    wantsCount: number
    avgRank: number | null
    worstRank: number | null
    unrankedCount: number
  }

  const scored: Candidate[] = []

  for (const bookId of candidateBookIds) {
    const userIds = signupsByBook.get(bookId) ?? []
    const memberCandidates: GroupMember[] = userIds.map(userId => ({
      userId,
      pseudonym: pseudonymMap.get(userId) ?? userId,
      rank: rankMap.get(`${userId}:${bookId}`) ?? null,
      interest: interest(rankMap.get(`${userId}:${bookId}`) ?? null),
    }))

    const group = pickBestGroup(memberCandidates, targetGroupSize)
    if (!group) continue

    const s = scoreCandidates(group)
    scored.push({ bookId, members: group, ...s })
  }

  // Sort by score descending
  scored.sort((a, b) => compareScore(b, a))

  // Build full member candidate lists for re-picking when initial group overlaps
  const memberCandidatesByBook = new Map<string, GroupMember[]>()
  for (const bookId of candidateBookIds) {
    const userIds2 = signupsByBook.get(bookId) ?? []
    memberCandidatesByBook.set(bookId, userIds2.map(userId => ({
      userId,
      pseudonym: pseudonymMap.get(userId) ?? userId,
      rank: rankMap.get(`${userId}:${bookId}`) ?? null,
      interest: interest(rankMap.get(`${userId}:${bookId}`) ?? null),
    })))
  }

  // Greedily select non-overlapping groups to maximize coverage
  const selectedUserIds = new Set<string>()
  const selected: Candidate[] = []

  for (const candidate of scored) {
    const overlaps = candidate.members.some(m => selectedUserIds.has(m.userId))
    if (!overlaps) {
      for (const m of candidate.members) selectedUserIds.add(m.userId)
      selected.push(candidate)
      if (selected.length >= maxResults) break
    } else {
      // Try re-picking from remaining participants
      const allCandidates = memberCandidatesByBook.get(candidate.bookId) ?? []
      const remaining = allCandidates.filter(m => !selectedUserIds.has(m.userId))
      const altGroup = pickBestGroup(remaining, targetGroupSize)
      if (altGroup) {
        const s = scoreCandidates(altGroup)
        for (const m of altGroup) selectedUserIds.add(m.userId)
        selected.push({ bookId: candidate.bookId, members: altGroup, ...s })
        if (selected.length >= maxResults) break
      }
    }
  }

  // Assign tiers
  if (selected.length === 0) return []

  const topWantsCount = selected[0].wantsCount
  return selected.map((c, i): ScenarioCard => {
    let tier: ScenarioCard['tier']
    if (i === 0) tier = 'leader'
    else if (c.wantsCount === topWantsCount) tier = 'max-coverage'
    else tier = 'sub-max'

    return {
      bookId: c.bookId,
      tier,
      members: c.members,
      wantsCount: c.wantsCount,
      avgRank: c.avgRank,
      worstRank: c.worstRank,
      unrankedCount: c.unrankedCount,
    }
  })
}
