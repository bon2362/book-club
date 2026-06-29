import { NextResponse } from 'next/server'
import {
  MatchingTransitionError,
  type MatchingTransitionErrorCode,
} from './session-transition'

export function transitionStatus(code: MatchingTransitionErrorCode): number {
  switch (code) {
    case 'session_not_found':
    case 'circle_not_found':
      return 404
    case 'participant_missing':
      return 403
    case 'session_frozen':
    case 'stale_state':
    case 'participant_locked':
      return 409
    case 'cascade_limit':
      return 500
  }
}

export function transitionError(error: unknown): NextResponse {
  if (error instanceof MatchingTransitionError) {
    return NextResponse.json(
      { error: error.code },
      { status: transitionStatus(error.code) },
    )
  }
  return NextResponse.json({ error: 'matching_transition_failed' }, { status: 500 })
}

export function expectedVersion(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 ? Number(value) : null
}
