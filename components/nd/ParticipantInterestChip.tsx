'use client'

import { interestLabel, isStrongInterest, rankTooltip } from './matching-shared'

interface Props {
  userId: string
  pseudonym: string
  rank: number | null
  personalStatus?: string | null
  viewingUserId?: string
  compact?: boolean
}

export default function ParticipantInterestChip({
  userId,
  pseudonym,
  rank,
  personalStatus = null,
  viewingUserId,
  compact = false,
}: Props) {
  const label = interestLabel(rank, personalStatus)
  const strong = isStrongInterest(rank) && personalStatus === null
  const isMe = viewingUserId === userId

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] border ${isMe ? 'ring-1 ring-current' : ''}`}
      style={{
        borderRadius: 0,
        borderColor: strong ? 'var(--success)' : 'var(--border)',
        background: strong ? 'var(--bg-tag-green)' : 'var(--bg-tag)',
        color: strong ? 'var(--success)' : 'var(--text-secondary)',
        fontWeight: strong ? 700 : 500,
      }}
      title={`${pseudonym}: ${rankTooltip(rank)}`}
    >
      {pseudonym}
      {!compact && <span className="ml-1 opacity-75">· {label}</span>}
    </span>
  )
}
