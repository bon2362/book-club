/** Pixel extent used to prevent event icons, bars, and labels from overlapping. */
export interface EventCollisionBox {
  id: string;
  start: number;
  end: number;
  selected?: boolean;
}

export interface EventLanePlacement {
  id: string;
  lane: number;
}

export interface EventLaneOptions {
  horizontalClearance?: number;
  prioritizeUnselected?: boolean;
}

function chronologicalOrder(left: EventCollisionBox, right: EventCollisionBox): number {
  return (
    left.start - right.start ||
    left.end - right.end ||
    left.id.localeCompare(right.id)
  );
}

function collisionFree(
  left: EventCollisionBox,
  right: EventCollisionBox,
  clearance: number,
): boolean {
  return left.end + clearance < right.start || right.end + clearance < left.start;
}

/** Assigns the lowest available temporary lane to each collision box. */
export function assignEventLanes(
  items: EventCollisionBox[],
  options: EventLaneOptions = {},
): EventLanePlacement[] {
  const clearance = options.horizontalClearance ?? 0;
  const sorted = [...items].sort(chronologicalOrder);

  if (options.prioritizeUnselected) {
    const selected = sorted.filter((item) => item.selected);
    if (selected.length > 0) {
      const unselected = sorted.filter((item) => !item.selected);
      const laneItems: EventCollisionBox[][] = [];

      const place = (item: EventCollisionBox): EventLanePlacement => {
        let lane = laneItems.findIndex((itemsInLane) =>
          itemsInLane.every((placed) => collisionFree(placed, item, clearance)),
        );
        if (lane === -1) {
          lane = laneItems.length;
          laneItems.push([]);
        }
        laneItems[lane]!.push(item);
        return { id: item.id, lane };
      };

      return [...unselected.map(place), ...selected.map(place)];
    }
  }

  const laneEnds: number[] = [];

  return sorted
    .map((item) => {
      let lane = laneEnds.findIndex((end) => end + clearance < item.start);

      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(item.end);
      } else {
        laneEnds[lane] = item.end;
      }

      return { id: item.id, lane };
    });
}
