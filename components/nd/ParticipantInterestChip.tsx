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
      className="nd-chip-text"
      style={{
        display: 'inline-flex',
        alignItems: 'baseline',
        gap: '0.25rem',
        fontSize: '0.78rem',
        color: 'var(--text-secondary)',
      }}
      title={`${pseudonym}: ${rankTooltip(rank)}`}
    >
      <b
        style={{
          fontWeight: isMe ? 700 : 500,
          color: strong ? 'var(--accent)' : 'inherit',
        }}
      >
        {pseudonym}
      </b>
      {!compact && (
        <span
          style={{
            fontSize: '0.72rem',
            color: strong ? 'var(--accent)' : 'var(--text-muted)',
            opacity: strong ? 0.85 : 1,
          }}
        >
          {label}
        </span>
      )}
    </span>
  )
}
