export interface HubEvent {
  type: string
  event_id: number
  payload: unknown
}

type Subscriber = {
  controller: ReadableStreamDefaultController
  userId: string
}

const MAX_SUBSCRIBERS_PER_SESSION = 50

// Per-session map of subscribers
const subscribers = new Map<string, Set<Subscriber>>()
// Per-session monotonic event ID counter
const eventCounters = new Map<string, number>()

function nextEventId(sessionId: string): number {
  const n = (eventCounters.get(sessionId) ?? 0) + 1
  eventCounters.set(sessionId, n)
  return n
}

export function subscriberCount(sessionId: string): number {
  return subscribers.get(sessionId)?.size ?? 0
}

export function canSubscribe(sessionId: string): boolean {
  return subscriberCount(sessionId) < MAX_SUBSCRIBERS_PER_SESSION
}

export function addSubscriber(sessionId: string, sub: Subscriber): void {
  let set = subscribers.get(sessionId)
  if (!set) {
    set = new Set()
    subscribers.set(sessionId, set)
  }
  set.add(sub)
}

export function removeSubscriber(sessionId: string, sub: Subscriber): void {
  const set = subscribers.get(sessionId)
  if (!set) return
  set.delete(sub)
  if (set.size === 0) subscribers.delete(sessionId)
}

export function broadcast(sessionId: string, type: string, payload: unknown): HubEvent {
  const event_id = nextEventId(sessionId)
  const event: HubEvent = { type, event_id, payload }
  const msg = encodeEvent(event)
  const set = subscribers.get(sessionId)
  if (set) {
    for (const sub of Array.from(set)) {
      try {
        sub.controller.enqueue(msg)
      } catch {
        // controller closed; will be cleaned up by cancel callback
      }
    }
  }
  return event
}

export function encodeEvent(event: HubEvent): Uint8Array {
  const text = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`
  return new TextEncoder().encode(text)
}

export function heartbeat(): Uint8Array {
  return new TextEncoder().encode(': ping\n\n')
}

// Exported for testing
export const hub = { broadcast, addSubscriber, removeSubscriber, canSubscribe, subscriberCount }
