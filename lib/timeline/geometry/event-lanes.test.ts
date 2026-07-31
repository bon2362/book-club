import { assignEventLanes } from './event-lanes';

describe('assignEventLanes', () => {
  it('puts colliding point labels, points, and intervals in separate lanes', () => {
    expect(
      assignEventLanes([
        { id: 'label', start: 10, end: 50 },
        { id: 'point', start: 40, end: 40 },
        { id: 'interval', start: 35, end: 70 },
      ]),
    ).toEqual([
      { id: 'label', lane: 0 },
      { id: 'interval', lane: 1 },
      { id: 'point', lane: 2 },
    ]);
  });

  it('reuses lane zero for non-colliding boxes', () => {
    expect(
      assignEventLanes([
        { id: 'first', start: 0, end: 20 },
        { id: 'second', start: 21, end: 40 },
      ]),
    ).toEqual([
      { id: 'first', lane: 0 },
      { id: 'second', lane: 0 },
    ]);
  });

  it('sorts equal layout inputs deterministically regardless of source order', () => {
    const boxes = [
      { id: 'b', start: 20, end: 30 },
      { id: 'c', start: 10, end: 30 },
      { id: 'a', start: 10, end: 30 },
    ];

    expect(assignEventLanes(boxes)).toEqual(assignEventLanes([...boxes].reverse()));
    expect(assignEventLanes(boxes)).toEqual([
      { id: 'a', lane: 0 },
      { id: 'c', lane: 1 },
      { id: 'b', lane: 2 },
    ]);
  });

  it('keeps the requested clearance between neighboring collision boxes', () => {
    const boxes = [
      { id: 'first', start: 0, end: 20 },
      { id: 'second', start: 25, end: 40 },
    ];

    expect(assignEventLanes(boxes, { horizontalClearance: 8 })).toEqual([
      { id: 'first', lane: 0 },
      { id: 'second', lane: 1 },
    ]);
    expect(assignEventLanes(boxes, { horizontalClearance: 4 })).toEqual([
      { id: 'first', lane: 0 },
      { id: 'second', lane: 0 },
    ]);
  });

  it('keeps non-overlapping selected items in their chronological lane', () => {
    expect(
      assignEventLanes(
        [
          { id: 'selected', start: -12, end: 12, selected: true },
          { id: 'unselected', start: 88, end: 112 },
        ],
        { horizontalClearance: 12, prioritizeUnselected: true },
      ),
    ).toEqual([
      { id: 'unselected', lane: 0 },
      { id: 'selected', lane: 0 },
    ]);
  });
});
