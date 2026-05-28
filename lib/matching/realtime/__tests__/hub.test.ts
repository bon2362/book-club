import {
  broadcast,
  addSubscriber,
  removeSubscriber,
  canSubscribe,
  subscriberCount,
  encodeEvent,
  heartbeat,
} from '../hub'

function makeMockController() {
  const enqueued: Uint8Array[] = []
  return {
    enqueue: jest.fn((chunk: Uint8Array) => enqueued.push(chunk)),
    close: jest.fn(),
    enqueued,
  }
}

describe('hub', () => {
  const sessionId = 'test-session-hub'

  afterEach(() => {
    // Clean up subscribers for the test session
    const count = subscriberCount(sessionId)
    if (count > 0) {
      // No direct reset, just remove individually is not easy; rely on test isolation
    }
  })

  it('subscriberCount starts at 0 for unknown session', () => {
    expect(subscriberCount('no-session')).toBe(0)
  })

  it('canSubscribe returns true below limit', () => {
    expect(canSubscribe('empty-session')).toBe(true)
  })

  it('addSubscriber and removeSubscriber track count', () => {
    const sid = 'count-test'
    const ctrl = makeMockController()
    const sub = { controller: ctrl as unknown as ReadableStreamDefaultController, userId: 'u1' }
    addSubscriber(sid, sub)
    expect(subscriberCount(sid)).toBe(1)
    removeSubscriber(sid, sub)
    expect(subscriberCount(sid)).toBe(0)
  })

  it('broadcast delivers encoded event to subscriber', () => {
    const sid = 'broadcast-test'
    const ctrl = makeMockController()
    const sub = { controller: ctrl as unknown as ReadableStreamDefaultController, userId: 'u1' }
    addSubscriber(sid, sub)
    const event = broadcast(sid, 'test_event', { foo: 'bar' })
    removeSubscriber(sid, sub)

    expect(event.type).toBe('test_event')
    expect(event.event_id).toBeGreaterThan(0)
    expect(ctrl.enqueue).toHaveBeenCalledTimes(1)

    const text = new TextDecoder().decode(ctrl.enqueued[0])
    expect(text).toContain('event: test_event')
    expect(text).toContain('"foo":"bar"')
  })

  it('broadcast increments event_id monotonically', () => {
    const sid = 'monotonic-test'
    const ctrl = makeMockController()
    const sub = { controller: ctrl as unknown as ReadableStreamDefaultController, userId: 'u1' }
    addSubscriber(sid, sub)
    const e1 = broadcast(sid, 'a', {})
    const e2 = broadcast(sid, 'b', {})
    const e3 = broadcast(sid, 'c', {})
    removeSubscriber(sid, sub)
    expect(e2.event_id).toBeGreaterThan(e1.event_id)
    expect(e3.event_id).toBeGreaterThan(e2.event_id)
  })

  it('broadcast handles controller errors gracefully', () => {
    const sid = 'error-test'
    const ctrl = {
      enqueue: jest.fn().mockImplementation(() => { throw new Error('closed') }),
    }
    const sub = { controller: ctrl as unknown as ReadableStreamDefaultController, userId: 'u1' }
    addSubscriber(sid, sub)
    expect(() => broadcast(sid, 'evt', {})).not.toThrow()
    removeSubscriber(sid, sub)
  })

  it('encodeEvent produces valid SSE format', () => {
    const encoded = encodeEvent({ type: 'foo', event_id: 42, payload: { x: 1 } })
    const text = new TextDecoder().decode(encoded)
    expect(text).toBe('event: foo\ndata: {"type":"foo","event_id":42,"payload":{"x":1}}\n\n')
  })

  it('heartbeat produces SSE comment format', () => {
    const hb = heartbeat()
    const text = new TextDecoder().decode(hb)
    expect(text).toBe(': ping\n\n')
  })
})
