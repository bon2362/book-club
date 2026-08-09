import { computeOverlap, type ParticipantAvailability } from '@/lib/calendar/overlap'

const D = '2026-08-09T'
const t = (hhmm: string) => new Date(`${D}${hhmm}:00.000Z`)
const win = { start: t('12:00'), end: new Date('2026-09-06T12:00:00.000Z') }

const person = (ref: string, from: string, to: string): ParticipantAvailability => ({
  ref,
  intervals: [{ startsAt: t(from), endsAt: t(to) }],
  busy: [],
})

describe('computeOverlap', () => {
  it('counts free, busy and idle participants per slot', () => {
    const result = computeOverlap({
      participants: [person('a', '17:00', '19:00'), person('b', '18:00', '20:00'), { ref: 'c', intervals: [], busy: [] }],
      window: win, now: t('12:00'), durationMinutes: 60, circleBusy: [],
    })
    const cell = result.cells.get(t('18:00').toISOString())!
    expect(cell.freeRefs).toEqual(['a', 'b'])
    expect(cell.idleRefs).toEqual(['c'])
    expect(result.markedRefs).toEqual(['a', 'b'])
  })

  it('marks candidates only where every marked participant is free for the full duration', () => {
    const result = computeOverlap({
      participants: [person('a', '17:00', '19:00'), person('b', '18:00', '20:00')],
      window: win, now: t('12:00'), durationMinutes: 60, circleBusy: [],
    })
    expect(result.candidateStarts.has(t('18:00').toISOString())).toBe(true)
    expect(result.candidateStarts.has(t('18:30').toISOString())).toBe(false)
    expect(result.candidateStarts.has(t('17:00').toISOString())).toBe(false)
  })

  it('does not let an idle participant block scheduling', () => {
    const result = computeOverlap({
      participants: [person('a', '17:00', '19:00'), person('b', '17:00', '19:00'), { ref: 'c', intervals: [], busy: [] }],
      window: win, now: t('12:00'), durationMinutes: 60, circleBusy: [],
    })
    expect(result.candidateStarts.has(t('17:00').toISOString())).toBe(true)
  })

  it('does not create candidates with only one marked participant', () => {
    const result = computeOverlap({
      participants: [person('a', '17:00', '19:00'), { ref: 'b', intervals: [], busy: [] }],
      window: win, now: t('12:00'), durationMinutes: 60, circleBusy: [],
    })
    expect(result.candidateStarts.size).toBe(0)
  })

  it('removes a candidate when a marked participant is busy in another circle', () => {
    const busyBlock = { meetingId: 'm', startsAt: t('18:00'), endsAt: t('18:30'), bookTitle: 'Дом листьев' }
    const result = computeOverlap({
      participants: [
        person('a', '17:00', '20:00'),
        { ...person('b', '17:00', '20:00'), busy: [busyBlock] },
      ],
      window: win, now: t('12:00'), durationMinutes: 60, circleBusy: [],
    })
    expect(result.candidateStarts.has(t('17:30').toISOString())).toBe(false)
    expect(result.candidateStarts.has(t('18:30').toISOString())).toBe(true)
    expect(result.cells.get(t('18:00').toISOString())!.busyRefs).toEqual(['b'])
  })

  it('blocks cells already occupied by a meeting of this circle', () => {
    const result = computeOverlap({
      participants: [person('a', '17:00', '20:00'), person('b', '17:00', '20:00')],
      window: win, now: t('12:00'), durationMinutes: 60,
      circleBusy: [{ meetingId: 'own', startsAt: t('18:00'), endsAt: t('19:00'), bookTitle: 'Заря всего' }],
    })
    expect(result.candidateStarts.has(t('18:00').toISOString())).toBe(false)
    expect(result.candidateStarts.has(t('19:00').toISOString())).toBe(true)
  })

  it('never treats past slots as candidates', () => {
    const result = computeOverlap({
      participants: [person('a', '12:00', '20:00'), person('b', '12:00', '20:00')],
      window: win, now: t('15:00'), durationMinutes: 60, circleBusy: [],
    })
    expect(result.candidateStarts.has(t('13:00').toISOString())).toBe(false)
    expect(result.candidateStarts.has(t('15:00').toISOString())).toBe(true)
  })

  it('rejects starts where the meeting would overrun the window', () => {
    const shortWindow = { start: t('12:00'), end: t('19:00') }
    const result = computeOverlap({
      participants: [person('a', '17:00', '19:00'), person('b', '17:00', '19:00')],
      window: shortWindow, now: t('12:00'), durationMinutes: 60, circleBusy: [],
    })
    expect(result.candidateStarts.has(t('18:00').toISOString())).toBe(true)
    expect(result.candidateStarts.has(t('18:30').toISOString())).toBe(false)
  })
})
