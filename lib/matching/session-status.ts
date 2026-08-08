export const MATCHING_OPEN_DB_STATUSES = ['active', 'open'] as const
export const MATCHING_CLOSED_DB_STATUSES = ['frozen', 'closed'] as const
export const MATCHING_CURRENT_DB_STATUSES = [...MATCHING_OPEN_DB_STATUSES, ...MATCHING_CLOSED_DB_STATUSES] as const

export type CanonicalMatchingSessionStatus = 'open' | 'closed'

export function isMatchingSessionOpen(status: string): boolean {
  return status === 'active' || status === 'open'
}

export function isMatchingSessionClosed(status: string): boolean {
  return status === 'frozen' || status === 'closed'
}

export function normalizeMatchingSessionStatus(status: string): CanonicalMatchingSessionStatus {
  return isMatchingSessionOpen(status) ? 'open' : 'closed'
}
