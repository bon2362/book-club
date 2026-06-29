import { createHash } from 'crypto'

export function buildCircleKey(input: {
  sessionId: string
  bookId: string
  memberUserIds: string[]
}): string {
  const canonical = JSON.stringify([
    input.sessionId,
    input.bookId,
    [...input.memberUserIds].sort(),
  ])

  return createHash('sha256').update(canonical).digest('base64url')
}
