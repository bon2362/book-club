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
  viewerAssignmentBookId: string | null
  adminParticipants?: Array<{
    adminUserId: string
    ref: string
    displayName: string
    assignmentBookId: string | null
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
  }>
}

function statusFor(input: {
  userId: string
  bookId: string
  intents: ReadonlyMap<string, BookModeIntentRow>
  assignments: ReadonlyMap<string, BookModeAssignmentRow>
}): BookParticipantStatus {
  const assignment = input.assignments.get(input.userId)
  if (assignment?.bookId === input.bookId) return 'assigned'
  return input.intents.get(`${input.userId}:${input.bookId}`)?.kind ?? 'interest'
}

export function buildPublicBookModeState(input: {
  initializedAt: Date
  sessionStatus: string
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
  const assignmentByUser = new Map(input.assignments.map(item => [item.userId, item]))
  const viewerAssignment = assignmentByUser.get(input.viewerUserId) ?? null
  const viewerHard = input.intents.find(item => item.userId === input.viewerUserId && item.kind === 'hard') ?? null
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
            assignments: assignmentByUser,
          }),
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
        assignments: assignmentByUser,
      })
      const viewerFree = !viewerAssignment

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
          conditional: !input.admin && open && viewerFree && !formed && !viewerHard,
          hard: !input.admin && open && viewerFree && viewerStatus !== 'hard',
          cancelHard: !input.admin && open && viewerFree && viewerStatus === 'hard',
        },
      }
    })
    .sort((left, right) => {
      const leftPinned = left.bookId === viewerAssignment?.bookId ? 2 : left.bookId === viewerHard?.bookId ? 1 : 0
      const rightPinned = right.bookId === viewerAssignment?.bookId ? 2 : right.bookId === viewerHard?.bookId ? 1 : 0
      return rightPinned - leftPinned || right.intersectionCount - left.intersectionCount ||
        left.sortOrder - right.sortOrder || left.title.localeCompare(right.title) || left.bookId.localeCompare(right.bookId)
    })
    .map((book) => {
      const publicBook = { ...book } as Omit<typeof book, 'sortOrder'> & { sortOrder?: number }
      delete publicBook.sortOrder
      return publicBook
    })

  return {
    initializedAt: input.initializedAt.toISOString(),
    viewerAssignmentBookId: viewerAssignment?.bookId ?? null,
    ...(input.admin ? {
      adminParticipants: input.participants
        .map(participant => ({
          adminUserId: participant.userId,
          ref: participant.publicRef,
          displayName: participant.displayName,
          assignmentBookId: assignmentByUser.get(participant.userId)?.bookId ?? null,
        }))
        .sort((left, right) => left.displayName.localeCompare(right.displayName) || left.ref.localeCompare(right.ref)),
    } : {}),
    books,
  }
}
