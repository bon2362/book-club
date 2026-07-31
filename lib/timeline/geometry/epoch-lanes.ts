import {
  epochYearRangesConflict,
  historicalCalendarYearOrdinal,
  type HistoricalYearRange,
} from '../calendar-year-overlap'

export interface EpochLaneInput extends HistoricalYearRange {
  id: string;
  pinnedLane?: number;
}

export interface EpochLanePlacement {
  id: string;
  lane: number;
}

export interface EpochLaneResult {
  placements: EpochLanePlacement[];
  laneCount: number;
}

function compareEpochs(left: EpochLaneInput, right: EpochLaneInput): number {
  return historicalCalendarYearOrdinal(left.start) - historicalCalendarYearOrdinal(right.start)
    || historicalCalendarYearOrdinal(left.end) - historicalCalendarYearOrdinal(right.end)
    || left.id.localeCompare(right.id);
}

/** Checks whether an epoch can reserve its requested lane without displacing another pin. */
export function validatePinnedEpochLane(
  candidate: EpochLaneInput,
  items: EpochLaneInput[],
): { valid: true } | { valid: false; conflictingEpochId: string } {
  const conflict = items
    .filter(
      (item) =>
        item.id !== candidate.id &&
        item.pinnedLane === candidate.pinnedLane &&
        epochYearRangesConflict(item, candidate),
    )
    .sort(compareEpochs)[0];

  return conflict ? { valid: false, conflictingEpochId: conflict.id } : { valid: true };
}

/** Packs epochs into stable full-duration lanes, reserving pinned lanes first. */
export function assignEpochLanes(items: EpochLaneInput[]): EpochLaneResult {
  const sortedItems = [...items].sort(compareEpochs);
  const laneItems: EpochLaneInput[][] = [];
  const placements = new Map<string, number>();

  for (const item of sortedItems.filter((entry) => entry.pinnedLane !== undefined)) {
    const lane = item.pinnedLane!;
    (laneItems[lane] ??= []).push(item);
    placements.set(item.id, lane);
  }

  for (const item of sortedItems.filter((entry) => entry.pinnedLane === undefined)) {
    let lane = 0;
    while (laneItems[lane]?.some((placed) => epochYearRangesConflict(placed, item))) lane += 1;

    (laneItems[lane] ??= []).push(item);
    placements.set(item.id, lane);
  }

  return {
    placements: sortedItems.map((item) => ({ id: item.id, lane: placements.get(item.id)! })),
    laneCount: laneItems.length,
  };
}
