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
}

export interface MatchingBookCircleView {
  id: string
  position: number
  memberRefs: string[]
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
