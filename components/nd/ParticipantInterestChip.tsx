'use client'

import { interestLabel, isStrongInterest, rankTooltip } from './matching-shared'

interface Props {
  userId: string
  pseudonym: string
  rank: number | null
  personalStatus?: string | null
  viewingUserId?: string
  compact?: boolean
  highlighted?: boolean
  dimmed?: boolean
}

export default function ParticipantInterestChip({
  userId,
  pseudonym,
  rank,
  personalStatus = null,
  viewingUserId,
  compact = false,
  highlighted = false,
  dimmed = false,
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
        background: highlighted ? 'var(--accent-soft)' : 'transparent',
        borderRadius: highlighted ? 6 : 0,
        padding: highlighted ? '0.04rem 0.34rem' : 0,
        margin: highlighted ? '0 -0.05rem' : 0,
        opacity: dimmed ? 0.4 : 1,
        transition: 'opacity 0.16s ease, background 0.16s ease',
      }}
      title={`${pseudonym}: ${rankTooltip(rank)}`}
    >
      <b
        style={{
          fontWeight: isMe ? 700 : 500,
          color: highlighted || strong ? 'var(--accent)' : 'inherit',
        }}
      >
        {pseudonym}
      </b>
      {!compact && (
        <span
          style={{
            fontSize: '0.72rem',
            color: highlighted || strong ? 'var(--accent)' : 'var(--text-muted)',
            opacity: highlighted || strong ? 0.85 : 1,
          }}
        >
          {label}
        </span>
      )}
    </span>
  )
}
