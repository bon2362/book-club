import type { GroupMember, MatchingScenario, OptimizationMode } from './scenarios'
import type { MyMoveBook } from './my-moves'

const INTEREST_TIER: Record<GroupMember['interest'], number> = {
  'без ранга': 0,
  'хочу': 1,
  'очень хочу': 2,
}

export interface MoveImpactInput {
  move: MyMoveBook
  scenario: MatchingScenario
  currentLeader: MatchingScenario | null
  viewingUserId: string
  bookTitleById: Map<string, string>
  mode?: OptimizationMode
}

export function buildMoveImpact({
  move,
  scenario,
  currentLeader,
  viewingUserId,
  bookTitleById,
  mode = 'coverage',
}: MoveImpactInput): NonNullable<MyMoveBook['impact']> | null {
  const moveCircle = scenario.circles.find((circle) => (
    circle.bookId === move.bookId &&
    circle.members.some((member) => member.userId === viewingUserId)
  ))
  if (!moveCircle) return null

  const circleBooks = scenario.circles.map((circle) => ({
    bookId: circle.bookId,
    title: bookTitleById.get(circle.bookId) ?? circle.bookId,
  }))
  const placeBefore = new Map<string, { bookId: string; interest: GroupMember['interest']; rank: number | null }>()

  for (const circle of currentLeader?.circles ?? []) {
    for (const member of circle.members) {
      placeBefore.set(member.userId, { bookId: circle.bookId, interest: member.interest, rank: member.rank })
    }
  }

  const beneficiaries = moveCircle.members
    .filter((member) => member.userId !== viewingUserId)
    .map((member) => {
      const prev = placeBefore.get(member.userId)
      const before = prev
        ? {
            place: 'circle' as const,
            bookTitle: bookTitleById.get(prev.bookId) ?? prev.bookId,
            interest: prev.interest,
            rankBefore: prev.rank,
          }
        : { place: 'leftOut' as const }
      return {
        userId: member.userId,
        pseudonym: member.pseudonym,
        before,
        after: member.interest,
        afterRank: member.rank,
      }
    })
    .filter((beneficiary) => (
      beneficiary.before.place === 'leftOut' ||
      INTEREST_TIER[beneficiary.after] > INTEREST_TIER[beneficiary.before.interest]
    ))

  const coverageGain = scenario.score.coveredCount - (currentLeader?.score.coveredCount ?? 0)
  // A left-out participant is only a real beneficiary when total coverage grows.
  // If coverage is flat, someone else was displaced, so the move is zero-sum.
  const meaningfulBeneficiaries = beneficiaries.filter((beneficiary) => (
    beneficiary.before.place === 'leftOut' ? coverageGain > 0 : true
  ))
  const viewerAfter = moveCircle.members.find((member) => member.userId === viewingUserId)?.rank ?? null
  const viewerBeforeRank = currentLeader?.circles
    .flatMap((circle) => circle.members)
    .find((member) => member.userId === viewingUserId)?.rank ?? null
  const viewerBeforePlace = placeBefore.get(viewingUserId)

  if (mode === 'satisfaction') {
    const wasLeftOut = viewerBeforeRank === null && !viewerBeforePlace
    const improvedRank = viewerAfter !== null && viewerBeforeRank !== null && viewerAfter < viewerBeforeRank
    if (!wasLeftOut && !improvedRank) return null
  } else if (meaningfulBeneficiaries.length === 0) {
    return null
  }

  return {
    scenarioId: scenario.id,
    scenarioTitle: 'Сценарий 1',
    coverageLabel: `${scenario.score.coveredCount}/${scenario.score.totalCount} участни:ц`,
    summary: '',
    circleTitles: circleBooks.map((book) => book.title),
    circleBooks,
    previewScenario: scenario,
    coverage: {
      before: currentLeader?.score.coveredCount ?? 0,
      after: scenario.score.coveredCount,
    },
    strongInterest: {
      before: currentLeader?.score.strongInterestCount ?? 0,
      after: scenario.score.strongInterestCount,
    },
    satisfaction: {
      before: viewerBeforeRank,
      after: viewerAfter,
    },
    beneficiaries: meaningfulBeneficiaries,
  }
}

export function sortMovesByImpact<T extends Pick<MyMoveBook, 'title' | 'impact'>>(moves: T[], mode: OptimizationMode = 'coverage'): T[] {
  if (mode === 'satisfaction') {
    const bestGain = (move: T): number => {
      const satisfaction = move.impact?.satisfaction
      const viewerGain = (() => {
        if (!satisfaction) return -Infinity
        if (satisfaction.before === null && satisfaction.after !== null) return Number.MAX_SAFE_INTEGER
        if (satisfaction.before === null || satisfaction.after === null) return -Infinity
        return satisfaction.before - satisfaction.after
      })()

      const beneficiaryGain = (move.impact?.beneficiaries ?? [])
        .reduce((max, b) => {
          if (b.before.place === 'leftOut') return Math.max(max, Number.MAX_SAFE_INTEGER / 2)
          const rankBefore = b.before.rankBefore ?? null
          const rankAfter = b.afterRank ?? null
          if (rankBefore === null || rankAfter === null) return max
          return Math.max(max, rankBefore - rankAfter)
        }, -Infinity)

      return Math.max(viewerGain, beneficiaryGain)
    }

    return [...moves].sort((a, b) => bestGain(b) - bestGain(a) || a.title.localeCompare(b.title, 'ru'))
  }

  return [...moves].sort((a, b) => {
    const coverageGainA = impactCoverageGain(a)
    const coverageGainB = impactCoverageGain(b)
    if (coverageGainA !== coverageGainB) return coverageGainB - coverageGainA

    const strongGainA = impactStrongInterestGain(a)
    const strongGainB = impactStrongInterestGain(b)
    if (strongGainA !== strongGainB) return strongGainB - strongGainA

    return a.title.localeCompare(b.title, 'ru')
  })
}

export function impactCoverageGain(move: Pick<MyMoveBook, 'impact'>): number {
  return (move.impact?.coverage.after ?? 0) - (move.impact?.coverage.before ?? 0)
}

export function impactStrongInterestGain(move: Pick<MyMoveBook, 'impact'>): number {
  return (move.impact?.strongInterest.after ?? 0) - (move.impact?.strongInterest.before ?? 0)
}
