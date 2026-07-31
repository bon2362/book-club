import {
  DENSITY_STAGES,
  reduceDensity,
  type DensityMarker,
  type DensityPoint,
  type DensityStage,
} from './density';
import {
  assignEventLanes,
  type EventCollisionBox,
  type EventLanePlacement,
} from './event-lanes';

/** Footprint of the dot box that keeps its centre on the event coordinate. */
export const EVENT_DOT_BOX_PX = 20;
export const EVENT_ICON_LABEL_GAP_PX = 8;
/** Longest label text drawn without also offering a tooltip. */
export const EVENT_LABEL_MAX_TEXT_WIDTH_PX = 256;

/**
 * Deterministic upper bound per glyph at the 13.5px label size. Labels are no
 * longer clipped, so this width decides whether a neighbour drops a lane —
 * it errs wide on purpose.
 */
const LABEL_GLYPH_UPPER_BOUND_PX = 9.5;
/** Dot box, two gaps and a four-digit year. */
const POINT_ROW_CHROME_PX = 64;
/** Boundary tick, two gaps and a "1618 — 1648" range. */
const INTERVAL_ROW_CHROME_PX = 96;

export interface EventLayoutInput {
  points: DensityPoint[];
  intervalBoxes: EventCollisionBox[];
  preferredStage: DensityStage;
  showAll: boolean;
  laneCapacity: number;
  horizontalClearance: number;
}

export interface EventLayoutResult {
  stage: DensityStage;
  markers: DensityMarker[];
  placements: EventLanePlacement[];
  laneCount: number;
}

export function estimateEventLabelTextWidth(label: string | undefined): number {
  return label === undefined || label.length === 0
    ? 0
    : Array.from(label).length * LABEL_GLYPH_UPPER_BOUND_PX;
}

/** Width of a whole marker row: marker, gaps, label and date. */
export function estimateEventRowWidth(
  label: string | undefined,
  shape: 'point' | 'interval' = 'point',
): number {
  const text = estimateEventLabelTextWidth(label);
  if (text === 0) return shape === 'interval' ? 0 : EVENT_DOT_BOX_PX;
  return (
    text + (shape === 'interval' ? INTERVAL_ROW_CHROME_PX : POINT_ROW_CHROME_PX)
  );
}

/**
 * An interval reserves whichever is wider: the years it spans, or its label
 * row, which starts at the interval head and freely runs past its tail.
 */
export function finishedIntervalCollisionBox(input: {
  id: string;
  start: number;
  end: number;
  label: string;
}): EventCollisionBox {
  return {
    id: input.id,
    start: input.start,
    end: Math.max(
      input.end,
      input.start + estimateEventRowWidth(input.label, 'interval'),
    ),
  };
}

/*
 * Every row reserves the same shape wherever it sits: marker first, label
 * running right. Nothing here may consult the viewport — a box that depended
 * on where a marker currently falls on screen would make lane assignment a
 * function of the scroll position, and panning would reshuffle the lanes.
 */
function collisionBoxForMarker(marker: DensityMarker): EventCollisionBox {
  if (marker.type === 'cluster') {
    return {
      id: marker.id,
      start: marker.start - EVENT_DOT_BOX_PX / 2,
      end: marker.end + EVENT_DOT_BOX_PX / 2,
    };
  }

  const head = marker.x - EVENT_DOT_BOX_PX / 2;

  return {
    id: marker.id,
    start: head,
    end: head + estimateEventRowWidth(marker.label),
    ...(marker.selected ? { selected: true } : {}),
  };
}

function allowedStages(
  preferredStage: DensityStage,
  showAll: boolean,
): readonly DensityStage[] {
  const preferredIndex = DENSITY_STAGES.indexOf(preferredStage);
  const initialStages = DENSITY_STAGES.slice(preferredIndex);

  if (!showAll) return initialStages;

  const stagesWithoutClusters = initialStages.filter((stage) => stage !== 'cluster');
  return stagesWithoutClusters.length > 0 ? stagesWithoutClusters : ['marker-only'];
}

function layoutForStage(
  input: EventLayoutInput,
  stage: DensityStage,
): EventLayoutResult {
  const markers = reduceDensity(input.points, { stage, showAll: input.showAll });
  const placements = assignEventLanes(
    [
      ...input.intervalBoxes,
      ...markers.map(collisionBoxForMarker),
    ],
    {
      horizontalClearance: input.horizontalClearance,
      prioritizeUnselected: true,
    },
  );
  const laneCount = placements.length === 0
    ? 0
    : Math.max(...placements.map(({ lane }) => lane)) + 1;

  return { stage, markers, placements, laneCount };
}

export function buildEventLayout(input: EventLayoutInput): EventLayoutResult {
  const stages = allowedStages(input.preferredStage, input.showAll);
  let fallback: EventLayoutResult | undefined;

  for (const stage of stages) {
    const layout = layoutForStage(input, stage);
    if (layout.laneCount <= input.laneCapacity) return layout;
    fallback = layout;
  }

  return fallback!;
}
