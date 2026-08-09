import { shouldFormBook } from './book-partition'

export type BookIntentKind = 'conditional' | 'hard'
export type BookParticipantStatus = 'interest' | BookIntentKind | 'assigned'

export interface BookModeBookRow {
  bookId: string
  title: string
  author: string
  coverUrl: string | null
  sortOrder: number
  bookSlug?: string | null
  description?: string
  pages?: number | null
  publishedDate?: string
  textUrl?: string
  whyRead?: string | null
  recommendationLink?: string | null
  tags?: string[]
}

export interface BookModeParticipantRow {
  userId: string
  publicRef: string
  displayName: string
}

export interface BookModeInterestRow {
  userId: string
  bookId: string
  rank: number | null
}

export interface BookModeIntentRow {
  userId: string
  bookId: string
  kind: BookIntentKind
}

export interface BookModeAssignmentRow {
  userId: string
  bookId: string
  circleId: string | null
}

export interface BookModeCircleRow {
  id: string
  bookId: string
  position: number
}

export interface PublicBookModeState {
  initializedAt: string
  mutationsAvailable: boolean
  viewerAssignmentBookIds: string[]
  adminParticipants?: Array<{
    adminUserId: string
    ref: string
    displayName: string
    assignmentBookIds: string[]
  }>
  books: Array<{
    bookId: string
    title: string
    author: string
    coverUrl: string | null
    bookSlug: string | null
    description: string
    pages: number | null
    publishedDate: string
    textUrl: string
    whyRead: string | null
    recommendationLink: string | null
    tags: string[]
    intersectionCount: number
    formedAt: string | null
    currentViability: 'unformed' | 'viable' | 'needs_attention'
    viewerStatus: BookParticipantStatus
    participants: Array<{
      ref: string
      displayName: string
      status: BookParticipantStatus
      rank: number | null
      adminUserId?: string
    }>
    circles: Array<{
      id: string
      position: number
      memberRefs: string[]
    }>
    unplacedParticipantRefs: string[]
    allowedActions: {
      conditional: boolean
      hard: boolean
      cancelHard: boolean
    }
    /** True when setting the viewer's conditional would immediately form the book and assign them. */
    conditionalWouldAssign: boolean
  }>
}

function statusFor(input: {
  userId: string
  bookId: string
  intents: ReadonlyMap<string, BookModeIntentRow>
  assignments: ReadonlyMap<string, BookModeAssignmentRow>
}): BookParticipantStatus {
  if (input.assignments.has(`${input.userId}:${input.bookId}`)) return 'assigned'
  return input.intents.get(`${input.userId}:${input.bookId}`)?.kind ?? 'interest'
}

export function buildPublicBookModeState(input: {
  initializedAt: Date
  sessionStatus: string
  multibookReady?: boolean
  viewerUserId: string
  admin: boolean
  books: BookModeBookRow[]
  participants: BookModeParticipantRow[]
  interests: BookModeInterestRow[]
  intents: BookModeIntentRow[]
  assignments: BookModeAssignmentRow[]
  formedAtByBookId: ReadonlyMap<string, Date>
  circles: BookModeCircleRow[]
}): PublicBookModeState {
  const participantById = new Map(input.participants.map(item => [item.userId, item]))
  const intentByUserBook = new Map(input.intents.map(item => [`${item.userId}:${item.bookId}`, item]))
  const assignmentByUserBook = new Map(input.assignments.map(item => [`${item.userId}:${item.bookId}`, item]))
  const interestByUserBook = new Map(input.interests.map(item => [`${item.userId}:${item.bookId}`, item]))
  const viewerAssignmentBookIds = new Set(
    input.assignments.filter(item => item.userId === input.viewerUserId).map(item => item.bookId),
  )
  const viewerHardBookIds = new Set(
    input.intents.filter(item => item.userId === input.viewerUserId && item.kind === 'hard').map(item => item.bookId),
  )
  const viewerHasHard = viewerHardBookIds.size > 0
  const viewerBookIds = new Set(
    input.interests.filter(item => item.userId === input.viewerUserId).map(item => item.bookId),
  )
  const visibleBookIds = input.admin
    ? new Set(input.interests.map(item => item.bookId).concat(
      input.intents.map(item => item.bookId),
      input.assignments.map(item => item.bookId),
      Array.from(input.formedAtByBookId.keys()),
      input.circles.map(item => item.bookId),
    ))
    : viewerBookIds
  const open = input.sessionStatus === 'open'
  const mutationsAvailable = input.multibookReady !== false

  const books = input.books
    .filter(book => visibleBookIds.has(book.bookId))
    .map((book) => {
      const interestedUserIds = Array.from(new Set(
        input.interests.filter(item => item.bookId === book.bookId).map(item => item.userId),
      ))
      const bookParticipantUserIds = Array.from(new Set([
        ...interestedUserIds,
        ...input.intents.filter(item => item.bookId === book.bookId).map(item => item.userId),
        ...input.assignments.filter(item => item.bookId === book.bookId).map(item => item.userId),
      ]))
      const participants = bookParticipantUserIds.flatMap((userId) => {
        const participant = participantById.get(userId)
        if (!participant) return []
        return [{
          ref: participant.publicRef,
          displayName: participant.displayName,
          status: statusFor({
            userId,
            bookId: book.bookId,
            intents: intentByUserBook,
            assignments: assignmentByUserBook,
          }),
          rank: interestByUserBook.get(`${userId}:${book.bookId}`)?.rank ?? null,
          ...(input.admin ? { adminUserId: userId } : {}),
        }]
      }).sort((left, right) => left.displayName.localeCompare(right.displayName) || left.ref.localeCompare(right.ref))
      const bookAssignments = input.assignments.filter(item => item.bookId === book.bookId)
      const bookCircles = input.circles
        .filter(item => item.bookId === book.bookId)
        .sort((left, right) => left.position - right.position || left.id.localeCompare(right.id))
      const circles = bookCircles.map(circle => ({
        id: circle.id,
        position: circle.position,
        memberRefs: bookAssignments
          .filter(item => item.circleId === circle.id)
          .flatMap(item => participantById.get(item.userId)?.publicRef ?? [])
          .sort(),
      }))
      const unplacedParticipantRefs = bookAssignments
        .filter(item => item.circleId === null)
        .flatMap(item => participantById.get(item.userId)?.publicRef ?? [])
      const formedAt = input.formedAtByBookId.get(book.bookId) ?? null
      const formed = formedAt !== null
      const viable = formed && bookAssignments.length >= 3 && unplacedParticipantRefs.length === 0 &&
        circles.length > 0 && circles.every(circle => circle.memberRefs.length >= 3 && circle.memberRefs.length <= 5)
      const viewerStatus = statusFor({
        userId: input.viewerUserId,
        bookId: book.bookId,
        intents: intentByUserBook,
        assignments: assignmentByUserBook,
      })
      const viewerAssignedHere = viewerAssignmentBookIds.has(book.bookId)
      const bookInterestRows = input.interests.filter(item => item.bookId === book.bookId)
      const decisionStatuses = bookParticipantUserIds
        .map(userId => statusFor({
          userId,
          bookId: book.bookId,
          intents: intentByUserBook,
          assignments: assignmentByUserBook,
        }))
      const finalCount = decisionStatuses.filter(status => status === 'hard' || status === 'assigned').length
      const conditionalCount = decisionStatuses.filter(status => status === 'conditional').length
      // Adding the viewer's conditional forms the book (and assigns them) only when the
      // real rule holds among the other available intents: ≥2 hard and hard+conditional ≥ 3.
      const otherAvailableStatuses = bookParticipantUserIds
        .filter(userId => userId !== input.viewerUserId)
        .map(userId => statusFor({
          userId,
          bookId: book.bookId,
          intents: intentByUserBook,
          assignments: assignmentByUserBook,
        }))
      const otherHardCount = otherAvailableStatuses.filter(status => status === 'hard').length
      const otherConditionalCount = otherAvailableStatuses.filter(status => status === 'conditional').length
      const conditionalWouldAssign = mutationsAvailable && !formed && !viewerAssignedHere && !viewerHasHard &&
        shouldFormBook(otherHardCount, otherConditionalCount + 1)
      const availableRanks = bookInterestRows
        .flatMap(item => item.rank === null ? [] : [item.rank])

      return {
        bookId: book.bookId,
        title: book.title,
        author: book.author,
        coverUrl: book.coverUrl,
        bookSlug: book.bookSlug ?? null,
        description: book.description ?? '',
        pages: book.pages ?? null,
        publishedDate: book.publishedDate ?? '',
        textUrl: book.textUrl ?? '',
        whyRead: book.whyRead ?? null,
        recommendationLink: book.recommendationLink ?? null,
        tags: book.tags ?? [],
        sortOrder: book.sortOrder,
        intersectionCount: interestedUserIds.filter(userId => userId !== input.viewerUserId).length,
        formedAt: formedAt?.toISOString() ?? null,
        currentViability: !formed ? 'unformed' as const : viable ? 'viable' as const : 'needs_attention' as const,
        viewerStatus,
        participants,
        circles,
        unplacedParticipantRefs,
        allowedActions: {
          conditional: mutationsAvailable && !input.admin && open && !formed && !viewerAssignedHere && !viewerHasHard,
          hard: mutationsAvailable && !input.admin && open && !viewerAssignedHere && viewerStatus !== 'hard',
          cancelHard: mutationsAvailable && !input.admin && open && viewerStatus === 'hard',
        },
        conditionalWouldAssign,
        decisionScore: {
          formed: formed ? 1 : 0,
          finalCount,
          conditionalCount,
          viewerOnlyTail: !formed && interestedUserIds.every(userId => userId === input.viewerUserId) ? 1 : 0,
          hasIntersection: bookInterestRows.some(item => item.userId !== input.viewerUserId) ? 1 : 0,
          avgRank: availableRanks.length > 0
            ? availableRanks.reduce((sum, rank) => sum + rank, 0) / availableRanks.length
            : null,
          worstRank: availableRanks.length > 0 ? Math.max(...availableRanks) : null,
          interestedCount: availableRanks.length,
        },
      }
    })
    .sort((left, right) => {
      const leftPinned = viewerAssignmentBookIds.has(left.bookId) ? 2 : viewerHardBookIds.has(left.bookId) ? 1 : 0
      const rightPinned = viewerAssignmentBookIds.has(right.bookId) ? 2 : viewerHardBookIds.has(right.bookId) ? 1 : 0
      const leftAvg = left.decisionScore.avgRank ?? Number.POSITIVE_INFINITY
      const rightAvg = right.decisionScore.avgRank ?? Number.POSITIVE_INFINITY
      const leftWorst = left.decisionScore.worstRank ?? Number.POSITIVE_INFINITY
      const rightWorst = right.decisionScore.worstRank ?? Number.POSITIVE_INFINITY
      return rightPinned - leftPinned ||
        left.decisionScore.viewerOnlyTail - right.decisionScore.viewerOnlyTail ||
        right.decisionScore.formed - left.decisionScore.formed ||
        right.decisionScore.finalCount - left.decisionScore.finalCount ||
        right.decisionScore.conditionalCount - left.decisionScore.conditionalCount ||
        right.decisionScore.hasIntersection - left.decisionScore.hasIntersection ||
        leftAvg - rightAvg || leftWorst - rightWorst ||
        right.decisionScore.interestedCount - left.decisionScore.interestedCount ||
        left.sortOrder - right.sortOrder || left.title.localeCompare(right.title) || left.bookId.localeCompare(right.bookId)
    })
    .map((book) => {
      const publicBook = { ...book } as Omit<typeof book, 'sortOrder' | 'decisionScore'> & { sortOrder?: number; decisionScore?: typeof book.decisionScore }
      delete publicBook.sortOrder
      delete publicBook.decisionScore
      return publicBook
    })

  return {
    initializedAt: input.initializedAt.toISOString(),
    mutationsAvailable,
    viewerAssignmentBookIds: Array.from(viewerAssignmentBookIds).sort(),
    ...(input.admin ? {
      adminParticipants: input.participants
        .map(participant => ({
          adminUserId: participant.userId,
          ref: participant.publicRef,
          displayName: participant.displayName,
          assignmentBookIds: input.assignments
            .filter(assignment => assignment.userId === participant.userId)
            .map(assignment => assignment.bookId)
            .sort(),
        }))
        .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.ref.localeCompare(right.ref)),
    } : {}),
    books,
  }
}
