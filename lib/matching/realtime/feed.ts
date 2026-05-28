export type FeedEventType =
  | 'book_added_new_group'
  | 'book_added_no_change'
  | 'book_removed_group_disappeared'
  | 'book_removed_no_change'

export interface FeedEvent {
  id: number
  type: FeedEventType
  actor: string  // pseudonym
  bookId: string
  ts: number
}

const BUFFER_SIZE = 100

const buffers = new Map<string, FeedEvent[]>()
const idCounters = new Map<string, number>()

function nextId(sessionId: string): number {
  const n = (idCounters.get(sessionId) ?? 0) + 1
  idCounters.set(sessionId, n)
  return n
}

export function appendFeed(sessionId: string, event: Omit<FeedEvent, 'id' | 'ts'>): FeedEvent {
  let buf = buffers.get(sessionId)
  if (!buf) {
    buf = []
    buffers.set(sessionId, buf)
  }
  const entry: FeedEvent = { ...event, id: nextId(sessionId), ts: Date.now() }
  buf.push(entry)
  if (buf.length > BUFFER_SIZE) buf.shift()
  return entry
}

export function getFeed(sessionId: string): FeedEvent[] {
  return [...(buffers.get(sessionId) ?? [])]
}
