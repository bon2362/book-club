import type { MatchingBookDetail } from './MatchingBookDetailModal'

export type MatchingBookParticipantStatus = 'interest' | 'conditional' | 'hard' | 'assigned'
export type MatchingBookViewerStatus = MatchingBookParticipantStatus
export type MatchingBookViability = 'unformed' | 'viable' | 'needs_attention'

export interface MatchingBookParticipantView {
  ref: string
  displayName: string
  status: MatchingBookParticipantStatus
  rank: number | null
  /** Present only in the privileged admin read model. */
  adminUserId?: string
  /** Admin read model only: the organiser released this participant to reading. */
  completed?: boolean
}

export interface MatchingBookCircleView {
  id: string
  position: number
  memberRefs: string[]
  memberDisplayNames?: Record<string, string>
  /** The organiser sent this circle off to read. */
  released?: boolean
}

export interface MatchingBookAllowedActions {
  conditional: boolean
  hard: boolean
  cancelHard: boolean
}

export interface MatchingBookView {
  bookId: string
  title: string
  author: string
  coverUrl: string | null
  intersectionCount: number
  formedAt: string | null
  currentViability: MatchingBookViability
  viewerStatus: MatchingBookViewerStatus
  participants: MatchingBookParticipantView[]
  circles: MatchingBookCircleView[]
  unplacedParticipantRefs: string[]
  allowedActions: MatchingBookAllowedActions
  /** Server-computed: setting the viewer's conditional here would immediately form and assign. */
  conditionalWouldAssign?: boolean
  /** 'reading' — вьюер читает книгу сейчас; такие книги вне подбора. */
  viewerPersonalStatus?: 'reading' | null
  /** Optional catalog fields let the shared detail sheet work in admin union mode. */
  bookSlug?: string | null
  description?: string
  pages?: number | null
  publishedDate?: string
  textUrl?: string
  whyRead?: string | null
  recommendationLink?: string | null
  tags?: string[]
}

export interface MatchingBookModeState {
  initializedAt: string
  mutationsAvailable?: boolean
  viewerCompleted?: boolean
  viewerAssignmentBookIds: string[]
  books: MatchingBookView[]
  /** Privileged union of all session members; absent from participant DTOs. */
  adminParticipants?: MatchingBookAdminParticipant[]
}

export interface MatchingBookAdminParticipant {
  ref: string
  displayName: string
  adminUserId: string
  assignmentBookIds: string[]
  completed?: boolean
}

export function matchingBookDetail(
  book: MatchingBookView,
  fallback?: MatchingBookDetail,
): MatchingBookDetail {
  return {
    bookId: book.bookId,
    bookSlug: book.bookSlug ?? fallback?.bookSlug,
    title: book.title,
    author: book.author,
    coverUrl: book.coverUrl,
    description: book.description ?? fallback?.description ?? '',
    pages: book.pages ?? fallback?.pages ?? null,
    publishedDate: book.publishedDate ?? fallback?.publishedDate ?? '',
    textUrl: book.textUrl ?? fallback?.textUrl ?? '',
    whyRead: book.whyRead ?? fallback?.whyRead ?? null,
    recommendationLink: book.recommendationLink ?? fallback?.recommendationLink ?? null,
    tags: book.tags ?? fallback?.tags ?? [],
  }
}

/** Includes interest, conditional, hard and assigned peers, not just shortlist counts. */
export function hasEnoughBookParticipantsToEnroll(book: MatchingBookView, viewerRef: string): boolean {
  return book.participants.filter((participant) => participant.ref !== viewerRef).length >= 2
}

/**
 * Tail books sit below the divider because a participant cannot act on them right now:
 * either there is no one else to match with yet ("waiting"), or the viewer is currently
 * reading the book so it is intentionally excluded from matching ("reading"). A book the
 * viewer is reading is always tail, even if it has peers or has already formed — the
 * server keeps its allowedActions all false, but the tail placement itself is a UI concern.
 */
export function isTailBook(
  book: MatchingBookView,
  viewerRef: string,
  viewerAssignmentBookIds: string[],
): boolean {
  if (book.viewerPersonalStatus === 'reading') return true
  return !hasEnoughBookParticipantsToEnroll(book, viewerRef) && book.formedAt === null &&
    !viewerAssignmentBookIds.includes(book.bookId) && book.viewerStatus !== 'hard'
}

/**
 * Card-local mirror of isTailBook's "waiting" branch: a card never receives
 * viewerAssignmentBookIds directly, but book.viewerStatus === 'assigned' is set exactly
 * when the book is in that list (see lib/matching/book-public-state.ts), so it is an
 * equivalent check here.
 */
export function tailReason(book: MatchingBookView, viewerRef: string): 'waiting' | 'reading' | null {
  if (book.viewerPersonalStatus === 'reading') return 'reading'
  const waiting = !hasEnoughBookParticipantsToEnroll(book, viewerRef) && book.formedAt === null &&
    book.viewerStatus !== 'assigned' && book.viewerStatus !== 'hard'
  return waiting ? 'waiting' : null
}
