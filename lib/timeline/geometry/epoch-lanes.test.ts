import { assignEpochLanes, validatePinnedEpochLane } from './epoch-lanes';

describe('assignEpochLanes', () => {
  it('keeps every epoch in one lane for its full duration and reuses lanes after it ends', () => {
    expect(
      assignEpochLanes([
        { id: 'early', start: { year: 1, era: 'CE' }, end: { year: 10, era: 'CE' } },
        { id: 'overlap', start: { year: 5, era: 'CE' }, end: { year: 15, era: 'CE' } },
        { id: 'later', start: { year: 16, era: 'CE' }, end: { year: 20, era: 'CE' } },
      ]),
    ).toEqual({
      placements: [
        { id: 'early', lane: 0 },
        { id: 'overlap', lane: 1 },
        { id: 'later', lane: 0 },
      ],
      laneCount: 2,
    });
  });

  it('reserves requested lanes for pinned epochs before placing unpinned epochs', () => {
    expect(
      assignEpochLanes([
        { id: 'pinned', start: { year: 1, era: 'CE' }, end: { year: 10, era: 'CE' }, pinnedLane: 1 },
        { id: 'unpin-before', start: { year: 1, era: 'CE' }, end: { year: 5, era: 'CE' } },
        { id: 'unpin-overlap', start: { year: 6, era: 'CE' }, end: { year: 12, era: 'CE' } },
      ]),
    ).toEqual({
      placements: [
        { id: 'unpin-before', lane: 0 },
        { id: 'pinned', lane: 1 },
        { id: 'unpin-overlap', lane: 0 },
      ],
      laneCount: 2,
    });
  });

  it('keeps epochs with one shared year in the same automatic lane', () => {
    expect(assignEpochLanes([
      {
        id: 'roman',
        start: { year: 24, era: 'BCE' },
        end: { year: 395, era: 'CE' },
      },
      {
        id: 'byzantine',
        start: { year: 395, era: 'CE' },
        end: { year: 1453, era: 'CE' },
      },
    ])).toEqual({
      placements: [
        { id: 'roman', lane: 0 },
        { id: 'byzantine', lane: 0 },
      ],
      laneCount: 1,
    });
  });

  it('moves epochs with two shared years to separate automatic lanes', () => {
    const result = assignEpochLanes([
      {
        id: 'first',
        start: { year: 100, era: 'CE' },
        end: { year: 396, era: 'CE' },
      },
      {
        id: 'second',
        start: { year: 395, era: 'CE' },
        end: { year: 500, era: 'CE' },
      },
    ]);

    expect(result.placements).toEqual([
      { id: 'first', lane: 0 },
      { id: 'second', lane: 1 },
    ]);
  });
});

describe('validatePinnedEpochLane', () => {
  it('accepts a pin with one shared year in the requested lane', () => {
    expect(
      validatePinnedEpochLane(
        { id: 'byzantine', start: { year: 395, era: 'CE' }, end: { year: 1453, era: 'CE' }, pinnedLane: 0 },
        [{ id: 'roman', start: { year: 24, era: 'BCE' }, end: { year: 395, era: 'CE' }, pinnedLane: 0 }],
      ),
    ).toEqual({ valid: true });
  });

  it('rejects a pin with two shared years in the requested lane', () => {
    expect(
      validatePinnedEpochLane(
        { id: 'second', start: { year: 395, era: 'CE' }, end: { year: 500, era: 'CE' }, pinnedLane: 0 },
        [{ id: 'first', start: { year: 100, era: 'CE' }, end: { year: 396, era: 'CE' }, pinnedLane: 0 }],
      ),
    ).toEqual({ valid: false, conflictingEpochId: 'first' });
  });
});
