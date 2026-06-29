import type {
  GroupMember,
  MatchingCircle,
  MatchingScenario,
  ScenarioCandidate,
  ScenarioOverview,
  ScenarioParticipant,
  ScenarioSetOverview,
} from './scenarios'
import type { MyMoveBook } from './my-moves'

type ParticipantIdMap = Map<string, string>

function publicId(userId: string, ids: ParticipantIdMap, fallback: string): string {
  return ids.get(userId) ?? fallback
}

function publicParticipant(participant: ScenarioParticipant, ids: ParticipantIdMap): ScenarioParticipant {
  return {
    userId: publicId(participant.userId, ids, participant.pseudonym),
    pseudonym: participant.pseudonym,
  }
}

function publicMember(member: GroupMember, ids: ParticipantIdMap): GroupMember {
  return {
    ...member,
    userId: publicId(member.userId, ids, member.pseudonym),
  }
}

function publicCircle(circle: MatchingCircle, ids: ParticipantIdMap, index: number): MatchingCircle {
  return {
    ...circle,
    id: `${circle.bookId}:circle-${index + 1}`,
    members: circle.members.map((member) => publicMember(member, ids)),
  }
}

export function publicizeScenario(
  scenario: MatchingScenario,
  ids: ParticipantIdMap,
  index = 0,
): MatchingScenario {
  return {
    ...scenario,
    id: `scenario-${index + 1}`,
    circles: scenario.circles.map((circle, circleIndex) => publicCircle(circle, ids, circleIndex)),
    leftOut: scenario.leftOut.map((participant) => publicParticipant(participant, ids)),
  }
}

function publicizeScenarioCard<T extends { members: GroupMember[] }>(card: T, ids: ParticipantIdMap): T {
  return {
    ...card,
    members: card.members.map((member) => publicMember(member, ids)),
  }
}

export function publicizeScenarioOverview(
  overview: ScenarioOverview,
  ids: ParticipantIdMap,
): ScenarioOverview {
  return {
    ...overview,
    current: overview.current.map((card) => publicizeScenarioCard(card, ids)),
    candidates: overview.candidates.map((candidate): ScenarioCandidate => ({
      ...publicizeScenarioCard(candidate, ids),
      conflictsWith: [],
    })),
    leftOut: overview.leftOut.map((participant) => publicParticipant(participant, ids)),
  }
}

export function publicizeScenarioSetOverview(
  overview: ScenarioSetOverview,
  ids: ParticipantIdMap,
): ScenarioSetOverview {
  const scenarios = overview.scenarios.map((scenario, index) => publicizeScenario(scenario, ids, index))
  const leaderIndex = overview.leader
    ? Math.max(overview.scenarios.findIndex((scenario) => scenario.id === overview.leader?.id), 0)
    : -1

  return {
    ...overview,
    scenarios,
    leader: leaderIndex >= 0 ? publicizeScenario(overview.leader!, ids, leaderIndex) : null,
  }
}

export function publicizeMyMoves(moves: MyMoveBook[], ids: ParticipantIdMap): MyMoveBook[] {
  return moves.map((move) => ({
    ...move,
    existingParticipants: move.existingParticipants.map((participant) => ({
      ...participant,
      userId: publicId(participant.userId, ids, participant.pseudonym),
    })),
    impact: move.impact
      ? {
          ...move.impact,
          scenarioId: move.impact.scenarioId ? 'scenario-preview' : null,
          previewScenario: publicizeScenario(move.impact.previewScenario, ids),
          beneficiaries: move.impact.beneficiaries.map((beneficiary) => ({
            ...beneficiary,
            userId: publicId(beneficiary.userId, ids, beneficiary.pseudonym),
          })),
        }
      : undefined,
  }))
}

export interface InternalMatchingParticipantState {
  userId: string
  publicRef: string
  displayName: string
  online: boolean
  confirmedCircleKey: string | null
}

export interface InternalMatchingCircleState {
  circleKey: string
  bookId: string
  memberUserIds: string[]
  confirmedUserIds: string[]
}

export interface PublicMatchingParticipantState {
  ref: string
  displayName: string
  online: boolean
  confirmedCircleKey: string | null
}

export interface PublicMatchingCircleState {
  circleKey: string
  bookId: string
  memberRefs: string[]
  confirmedRefs: string[]
}

function requirePublicRef(userId: string, refs: ReadonlyMap<string, string>): string {
  const ref = refs.get(userId)
  if (!ref) throw new Error(`Unknown matching participant: ${userId}`)
  return ref
}

export function buildPublicMatchingState(input: {
  participants: InternalMatchingParticipantState[]
  circles: InternalMatchingCircleState[]
}): {
  participants: PublicMatchingParticipantState[]
  circles: PublicMatchingCircleState[]
} {
  const refs = new Map(input.participants.map((participant) => [
    participant.userId,
    participant.publicRef,
  ]))

  return {
    participants: input.participants.map((participant) => ({
      ref: participant.publicRef,
      displayName: participant.displayName,
      online: participant.online,
      confirmedCircleKey: participant.confirmedCircleKey,
    })),
    circles: input.circles.map((circle) => ({
      circleKey: circle.circleKey,
      bookId: circle.bookId,
      memberRefs: circle.memberUserIds.map((userId) => requirePublicRef(userId, refs)),
      confirmedRefs: circle.confirmedUserIds.map((userId) => requirePublicRef(userId, refs)),
    })),
  }
}

interface PublicSessionParticipantInput {
  userId: string
  publicRef: string
  displayName: string
  online: boolean
}

interface PublicLockedCircleInput {
  id: string
  circleKey: string
  bookId: string
  lockedAt: Date
  members: Array<{ userId: string; displayNameSnapshot: string }>
}

interface PublicNoticeInput {
  id: string
  kind: string
  payload: Record<string, unknown>
  createdAt: Date
}

function namesForUserIds(
  value: unknown,
  participants: ReadonlyMap<string, PublicSessionParticipantInput>,
): string[] {
  if (!Array.isArray(value)) return []
  return value.map((userId) => {
    if (typeof userId !== 'string') throw new Error('Invalid matching notice participant')
    const participant = participants.get(userId)
    if (!participant) throw new Error(`Unknown matching participant: ${userId}`)
    return participant.displayName
  })
}

function publicNoticePayload(
  notice: PublicNoticeInput,
  participants: ReadonlyMap<string, PublicSessionParticipantInput>,
): Record<string, unknown> {
  switch (notice.kind) {
    case 'confirmation_transferred':
      return {
        fromMembers: namesForUserIds(notice.payload.fromMemberUserIds, participants),
        toMembers: namesForUserIds(notice.payload.toMemberUserIds, participants),
      }
    case 'confirmation_invalidated':
      return {
        members: namesForUserIds(notice.payload.memberUserIds, participants),
      }
    case 'circle_locked':
      return {
        circleKey: notice.payload.circleKey,
        bookId: notice.payload.bookId,
      }
    default:
      return {}
  }
}

export function assemblePublicSessionState(input: {
  session: {
    id: string
    name: string
    status: string
    stateVersion: number
    minGroupSize: number
    maxGroupSize: number
    frozenSnapshot: unknown
  }
  viewerUserId: string
  participants: PublicSessionParticipantInput[]
  rankedScenarios: import('./confirmation-reconciliation').RankedReconciliationScenario[]
  confirmations: import('./confirmation-reconciliation').CircleConfirmation[]
  lockedCircles: PublicLockedCircleInput[]
  notices: PublicNoticeInput[]
}) {
  const participantsByUserId = new Map(
    input.participants.map((participant) => [participant.userId, participant]),
  )
  const confirmationsByUserId = new Map(
    input.confirmations.map((confirmation) => [confirmation.userId, confirmation]),
  )
  const publicRef = (userId: string) => {
    const participant = participantsByUserId.get(userId)
    if (!participant) throw new Error(`Unknown matching participant: ${userId}`)
    return participant.publicRef
  }
  const lockedCircle = input.lockedCircles.find((circle) => (
    circle.members.some((member) => member.userId === input.viewerUserId)
  ))
  const viewer = participantsByUserId.get(input.viewerUserId)
  if (!viewer) throw new Error(`Unknown matching participant: ${input.viewerUserId}`)

  return {
    session: {
      name: input.session.name,
      status: input.session.status,
      stateVersion: input.session.stateVersion,
      minGroupSize: input.session.minGroupSize,
      maxGroupSize: input.session.maxGroupSize,
      frozenSnapshot: input.session.frozenSnapshot,
    },
    viewer: {
      role: lockedCircle ? 'observer' as const : 'active' as const,
      ref: viewer.publicRef,
      lockedCircleId: lockedCircle?.id ?? null,
    },
    participants: input.participants.map((participant) => ({
      ref: participant.publicRef,
      displayName: participant.displayName,
      online: participant.online,
      confirmedCircleKey: confirmationsByUserId.get(participant.userId)?.circleKey ?? null,
    })),
    scenarios: input.rankedScenarios.map((scenario, scenarioIndex) => ({
      ref: `scenario-${scenarioIndex + 1}`,
      circles: scenario.circles.map((circle) => {
        const members = circle.memberUserIds.map((userId) => {
          const participant = participantsByUserId.get(userId)
          if (!participant) throw new Error(`Unknown matching participant: ${userId}`)
          return {
            ref: participant.publicRef,
            displayName: participant.displayName,
            confirmed: confirmationsByUserId.get(userId)?.circleKey === circle.circleKey,
          }
        })
        return {
          circleKey: circle.circleKey,
          bookId: circle.bookId,
          members,
          confirmedCount: members.filter((member) => member.confirmed).length,
          memberCount: members.length,
          viewerIsMember: circle.memberUserIds.includes(input.viewerUserId),
        }
      }),
    })),
    lockedCircles: input.lockedCircles.map((circle) => ({
      id: circle.id,
      circleKey: circle.circleKey,
      bookId: circle.bookId,
      lockedAt: circle.lockedAt.toISOString(),
      members: circle.members.map((member) => ({
        ref: publicRef(member.userId),
        displayName: member.displayNameSnapshot,
      })),
    })),
    notices: input.notices.map((notice) => ({
      id: notice.id,
      kind: notice.kind,
      payload: publicNoticePayload(notice, participantsByUserId),
      createdAt: notice.createdAt.toISOString(),
    })),
  }
}
