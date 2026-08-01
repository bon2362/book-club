import { visibleClusterGeometry } from './TimelineEventLayer'

describe('visibleClusterGeometry', () => {
  const xById = new Map([
    ['hidden', 10],
    ['first', 30],
    ['second', 50],
  ])

  it('excludes hidden members from cluster position and click range', () => {
    expect(visibleClusterGeometry(
      ['hidden', 'first', 'second'],
      new Set(['first', 'second']),
      xById,
      100,
    )).toEqual({
      memberIds: ['first', 'second'],
      start: 30,
      end: 50,
      x: 40,
      intersectsCanvas: true,
    })
  })

  it('places a single remaining member on its own date', () => {
    expect(visibleClusterGeometry(
      ['hidden', 'second'],
      new Set(['second']),
      xById,
      100,
    )).toEqual({
      memberIds: ['second'],
      start: 50,
      end: 50,
      x: 50,
      intersectsCanvas: true,
    })
  })

  it('removes a single remaining dot after its full box leaves the canvas', () => {
    expect(visibleClusterGeometry(
      ['second'],
      new Set(['second']),
      new Map([['second', -5]]),
      100,
    )?.intersectsCanvas).toBe(false)
  })
})
