'use client'

import { getPseudonymColor, interestLabel, isStrongInterest, rankTooltip } from './matching-shared'

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
  const colors = getPseudonymColor(pseudonym)
  const label = interestLabel(rank, personalStatus)
  const strong = isStrongInterest(rank) && personalStatus === null
  const isMe = viewingUserId === userId

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-[11px] border ${colors.chip} ${isMe ? 'ring-1 ring-current' : ''}`}
      style={{
        borderRadius: 0,
        borderColor: strong ? 'var(--accent)' : undefined,
        background: strong ? 'var(--bg-tag-green)' : undefined,
        color: strong ? 'var(--accent)' : undefined,
        fontWeight: strong ? 700 : 500,
      }}
      title={`${pseudonym}: ${rankTooltip(rank)}`}
    >
      {pseudonym}
      {!compact && <span className="ml-1 opacity-75">· {label}</span>}
    </span>
  )
}
