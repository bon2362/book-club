import { assignMatchingDisplayNames, type MatchingNameRow } from './display-names'

export interface BookParticipantSignupRow {
  userId: string
  bookId: string
  rank: number | null
  personalStatus: string | null
}

export interface PublicBookParticipant {
  ref: string
  bookId: string
  displayName: string
  rank: number | null
  personalStatus: string | null
}

export function buildPublicBookParticipants(input: {
  participants: MatchingNameRow[]
  signups: BookParticipantSignupRow[]
}): PublicBookParticipant[] {
  const participantsByUserId = new Map(input.participants.map((participant) => [participant.userId, participant]))
  const displayNames = assignMatchingDisplayNames(input.participants)

  return input.signups.map((signup) => {
    const participant = participantsByUserId.get(signup.userId)
    if (!participant) throw new Error(`Unknown matching participant: ${signup.userId}`)
    return {
      ref: participant.publicRef,
      bookId: signup.bookId,
      displayName: displayNames.get(signup.userId) ?? 'Без имени',
      rank: signup.rank,
      personalStatus: signup.personalStatus,
    }
  })
}
