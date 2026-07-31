export interface DensityPoint {
  id: string;
  x: number;
  label: string;
  selected?: boolean;
}

export type DensityStage = 'full-label' | 'shortened-label' | 'marker-only' | 'cluster';

export const DENSITY_STAGES = [
  'full-label',
  'shortened-label',
  'marker-only',
  'cluster',
] as const satisfies readonly DensityStage[];

export interface DensityOptions {
  stage: DensityStage;
  maxLabelLength?: number;
  clusterPixelWidth?: number;
  showAll?: boolean;
}

export interface DensityPointMarker {
  type: 'point';
  id: string;
  x: number;
  label?: string;
  selected?: true;
}

export interface DensityClusterMarker {
  type: 'cluster';
  id: string;
  x: number;
  count: number;
  start: number;
  end: number;
  memberIds: string[];
}

export type DensityMarker = DensityPointMarker | DensityClusterMarker;

function shortenLabel(label: string, maxLength: number): string {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}…` : label;
}

function pointMarker(point: DensityPoint, label?: string): DensityPointMarker {
  return {
    type: 'point',
    id: point.id,
    x: point.x,
    ...(label === undefined ? {} : { label }),
    ...(point.selected ? { selected: true } : {}),
  };
}

/** Reduces point detail for lower zoom levels without hiding a selected point. */
export function reduceDensity(
  points: DensityPoint[],
  options: DensityOptions,
): DensityMarker[] {
  const sorted = [...points].sort((left, right) => left.x - right.x || left.id.localeCompare(right.id));

  if (options.stage === 'full-label') return sorted.map((point) => pointMarker(point, point.label));
  if (options.stage === 'shortened-label') {
    const maxLabelLength = options.maxLabelLength ?? 24;
    return sorted.map((point) => pointMarker(point, shortenLabel(point.label, maxLabelLength)));
  }
  if (options.stage === 'marker-only' || options.showAll) {
    return sorted.map((point) => pointMarker(point));
  }

  const clusterPixelWidth = options.clusterPixelWidth ?? 24;
  const markers: DensityMarker[] = [];
  let cluster: DensityPoint[] = [];

  const flushCluster = () => {
    if (cluster.length === 1) {
      markers.push(pointMarker(cluster[0]!));
    } else if (cluster.length > 1) {
      const start = cluster[0]!.x;
      const end = cluster.at(-1)!.x;
      markers.push({
        type: 'cluster',
        id: `cluster:${cluster.map((point) => point.id).join(':')}`,
        x: (start + end) / 2,
        count: cluster.length,
        start,
        end,
        memberIds: cluster.map((point) => point.id),
      });
    }
    cluster = [];
  };

  for (const point of sorted.filter((point) => !point.selected)) {
    if (cluster.length === 0 || point.x - cluster.at(-1)!.x <= clusterPixelWidth) {
      cluster.push(point);
    } else {
      flushCluster();
      cluster.push(point);
    }
  }
  flushCluster();
  markers.push(...sorted.filter((point) => point.selected).map((point) => pointMarker(point)));

  markers.sort((left, right) => left.x - right.x || left.id.localeCompare(right.id));

  return markers;
}
