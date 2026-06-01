import type { GroupMember, MatchingScenario } from './scenarios'
import type { MyMoveBook } from './my-moves'

export interface MoveImpactInput {
  move: MyMoveBook
  scenario: MatchingScenario
  currentLeader: MatchingScenario | null
  viewingUserId: string
  bookTitleById: Map<string, string>
}

export function buildMoveImpact({
  move,
  scenario,
  currentLeader,
  viewingUserId,
  bookTitleById,
}: MoveImpactInput): NonNullable<MyMoveBook['impact']> | null {
  const moveCircle = scenario.circles.find((circle) => (
    circle.bookId === move.bookId &&
    circle.members.some((member) => member.userId === viewingUserId)
  ))
  if (!moveCircle) return null

  const circleTitles = scenario.circles.map((circle) => bookTitleById.get(circle.bookId) ?? circle.bookId)
  const circleBooks = scenario.circles.map((circle) => ({
    bookId: circle.bookId,
    title: bookTitleById.get(circle.bookId) ?? circle.bookId,
  }))
  const moveTitle = bookTitleById.get(move.bookId) ?? move.title
  const placeBefore = new Map<string, { bookId: string; interest: GroupMember['interest'] }>()

  for (const circle of currentLeader?.circles ?? []) {
    for (const member of circle.members) {
      placeBefore.set(member.userId, { bookId: circle.bookId, interest: member.interest })
    }
  }

  const beneficiaries = moveCircle.members
    .filter((member) => member.userId !== viewingUserId)
    .map((member) => {
      const prev = placeBefore.get(member.userId)
      return {
        userId: member.userId,
        pseudonym: member.pseudonym,
        before: prev
          ? {
              place: 'circle' as const,
              bookTitle: bookTitleById.get(prev.bookId) ?? prev.bookId,
              interest: prev.interest,
            }
          : { place: 'leftOut' as const },
        after: member.interest,
      }
    })

  return {
    scenarioId: scenario.id,
    scenarioTitle: 'Сценарий 1',
    coverageLabel: `${scenario.score.coveredCount}/${scenario.score.totalCount} участни:ц`,
    summary: `Этот ход меняет лучший сценарий: появится круг «${moveTitle}», а весь сценарий будет: ${circleTitles.join(' + ')}.`,
    circleTitles,
    circleBooks,
    coverage: {
      before: currentLeader?.score.coveredCount ?? 0,
      after: scenario.score.coveredCount,
    },
    strongInterest: {
      before: currentLeader?.score.strongInterestCount ?? 0,
      after: scenario.score.strongInterestCount,
    },
    beneficiaries,
  }
}

export function sortMovesByImpact<T extends Pick<MyMoveBook, 'title' | 'impact'>>(moves: T[]): T[] {
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
