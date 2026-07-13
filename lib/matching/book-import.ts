import { MatchingTransitionError } from './session-transition'

export interface LegacyImportCircle {
  id: string
  bookId: string
}

export interface LegacyImportMember {
  circleId: string
  userId: string
}

export interface LegacyImportConfirmation {
  userId: string
  bookId: string
}

export function planLegacyBookModeImport(input: {
  participantUserIds: ReadonlySet<string>
  circles: LegacyImportCircle[]
  members: LegacyImportMember[]
  confirmations: LegacyImportConfirmation[]
}) {
  const assignedUserIds = new Set<string>()
  for (const circle of input.circles) {
    const members = input.members.filter(member => member.circleId === circle.id)
    if (members.length === 0) throw new MatchingTransitionError('invalid_book_action')
    for (const member of members) {
      if (!input.participantUserIds.has(member.userId) || assignedUserIds.has(member.userId)) {
        throw new MatchingTransitionError('invalid_book_action')
      }
      assignedUserIds.add(member.userId)
    }
  }
  for (const confirmation of input.confirmations) {
    if (!input.participantUserIds.has(confirmation.userId)) {
      throw new MatchingTransitionError('invalid_book_action')
    }
  }
  return {
    assignedUserIds,
    confirmations: input.confirmations.filter(item => !assignedUserIds.has(item.userId)),
  }
}
