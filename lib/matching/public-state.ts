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
