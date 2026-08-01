import {
  EVENT_LANE_BASE_PX,
  EVENT_LANE_PITCH_PX,
  eventLaneCapacity,
  labelMaxWidth,
  occupiedLaneCount,
} from './event-area'

describe('occupiedLaneCount', () => {
  it('counts nothing when the canvas is empty', () => {
    expect(occupiedLaneCount([], 1000)).toBe(0)
  })

  it('counts the lanes of items inside the canvas', () => {
    expect(occupiedLaneCount([
      { lane: 0, start: 10, end: 60 },
      { lane: 1, start: 40, end: 90 },
    ], 1000)).toBe(2)
  })

  /**
   * Дефект, ради которого функция и появилась: раскладка считается с запасом за
   * краями, и события далеко справа задирали высоту полотна, хотя на нём не
   * рисуются.
   */
  it('ignores items that sit entirely past the right edge', () => {
    expect(occupiedLaneCount([
      { lane: 0, start: 10, end: 60 },
      { lane: 7, start: 4000, end: 4200 },
    ], 1000)).toBe(1)
  })

  it('ignores items that sit entirely past the left edge', () => {
    expect(occupiedLaneCount([
      { lane: 0, start: 10, end: 60 },
      { lane: 5, start: -900, end: -400 },
    ], 1000)).toBe(1)
  })

  it('keeps an interval that only overlaps the canvas partly', () => {
    expect(occupiedLaneCount([{ lane: 3, start: -200, end: 40 }], 1000)).toBe(4)
  })
})

describe('eventLaneCapacity', () => {
  it('derives four lanes from the minimum 200 px canvas', () => {
    expect(eventLaneCapacity(200)).toBe(4)
  })

  it('derives ten lanes from the maximum 460 px canvas', () => {
    expect(eventLaneCapacity(460)).toBe(10)
  })

  it('keeps one lane when the measured box is temporarily too small', () => {
    expect(eventLaneCapacity(0)).toBe(1)
  })

  it('uses the exact base, top reserve and 44 px pitch from the handoff', () => {
    const heightForSixLanes = EVENT_LANE_BASE_PX + 6 + EVENT_LANE_PITCH_PX * 6
    expect(eventLaneCapacity(heightForSixLanes)).toBe(6)
  })
})

describe('labelMaxWidth', () => {
  it('gives the label everything up to the right edge minus the row chrome', () => {
    expect(labelMaxWidth(100, 1000, 64)).toBe(836)
  })

  /** Дефект: у правого края подпись уезжала за полотно и обрезалась глифом. */
  it('shrinks to the sliver left near the right edge', () => {
    expect(labelMaxWidth(950, 1000, 64)).toBe(0)
  })

  it('never returns a negative width for a marker past the edge', () => {
    expect(labelMaxWidth(1200, 1000, 64)).toBe(0)
  })
})
