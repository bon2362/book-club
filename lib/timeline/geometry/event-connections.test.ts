import { buildEventConnection } from './event-connections';

const range = { start: 1500, end: 1600 };

describe('buildEventConnection', () => {
  it('places a point at its exact axis coordinate', () => {
    expect(
      buildEventConnection(
        { start: { year: 1550, era: 'CE' }, ongoing: false },
        range,
        1000,
      ),
    ).toEqual({ kind: 'point', x: 500 });
  });

  it('returns two visible boundaries for a finished interval', () => {
    expect(
      buildEventConnection(
        {
          start: { year: 1510, era: 'CE', month: 1, day: 1 },
          end: { year: 1590, era: 'CE', month: 1, day: 1 },
          ongoing: false,
        },
        range,
        1000,
      ),
    ).toEqual({
      kind: 'finished-interval',
      startX: 100,
      endX: 900,
      startVisible: true,
      endVisible: true,
    });
  });

  it('clips an interval without inventing a boundary at the viewport edge', () => {
    expect(
      buildEventConnection(
        {
          start: { year: 1490, era: 'CE', month: 1, day: 1 },
          end: { year: 1550, era: 'CE', month: 1, day: 1 },
          ongoing: false,
        },
        range,
        1000,
      ),
    ).toEqual({
      kind: 'finished-interval',
      startX: 0,
      endX: 500,
      startVisible: false,
      endVisible: true,
    });
  });

  it('uses the right viewport edge as a fade, not an end boundary, for ongoing events', () => {
    expect(
      buildEventConnection(
        { start: { year: 1540, era: 'CE' }, ongoing: true },
        range,
        1000,
      ),
    ).toEqual({
      kind: 'ongoing-interval',
      startX: 400,
      endX: 1000,
      startVisible: true,
    });
  });

  it('omits point geometry outside the visible range', () => {
    expect(
      buildEventConnection(
        { start: { year: 1700, era: 'CE' }, ongoing: false },
        range,
        1000,
      ),
    ).toBeUndefined();
  });
});
