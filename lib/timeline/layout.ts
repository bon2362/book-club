import { assignEpochLanes } from './geometry/epoch-lanes'
import { buildRulerTicks } from './geometry/ruler-ticks'
import { historicalDateToCoordinate } from './geometry/time-coordinate'
import { createViewportTransform, fitRange } from './geometry/viewport'

export type TimelineTextMeasurer = (text: string, font: string) => number

export interface TimelineLayoutEvent {
  id: string
  title: string
  dateLabel: string
  startX: number
  endX?: number
  isLibrary?: boolean
}

export interface TimelineSpanPlacement extends TimelineLayoutEvent {
  endX: number
  lane: number
  labelX: number
  labelled: boolean
  labelWidth: number
  dateWidth: number
  intersectsCanvas: boolean
}

export interface TimelineMarkerPlacement extends TimelineLayoutEvent {
  lane: number
  x: number
  mode: 'label' | 'dot'
  labelWidth: number
  dateWidth: number
  intersectsCanvas: boolean
}

export interface TimelineClusterPlacement {
  id: string
  lane: number
  x: number
  start: number
  end: number
  count: number
  memberIds: string[]
  intersectsCanvas: boolean
}

export interface TimelineLayoutResult {
  spans: TimelineSpanPlacement[]
  markers: TimelineMarkerPlacement[]
  clusters: TimelineClusterPlacement[]
  laneCount: number
}

interface TimelineLayoutInput {
  events: TimelineLayoutEvent[]
  width: number
  capacity: number
  markerWidth: number
  measureText: TimelineTextMeasurer
  labelFont: string
  dateFont: string
  clearance?: number
}

type OccupiedBox = readonly [start: number, end: number]

function makeLanes(capacity: number): OccupiedBox[][] {
  return Array.from({ length: Math.max(1, capacity) }, () => [])
}

function place(lanes: OccupiedBox[][], start: number, end: number, clearance: number): number {
  const lane = lanes.findIndex((boxes) => boxes.every(
    ([boxStart, boxEnd]) => end + clearance < boxStart || start - clearance > boxEnd,
  ))
  if (lane >= 0) lanes[lane]!.push([start, end])
  return lane
}

/** Finds the lane whose nearest occupied item is furthest from the anchor. */
function leastCrowded(lanes: OccupiedBox[][], anchor: number): number {
  let bestLane = 0
  let bestGap = -Infinity

  lanes.forEach((boxes, lane) => {
    const gap = boxes.length === 0
      ? Infinity
      : Math.min(...boxes.map(([start, end]) => (
          anchor < start ? start - anchor : anchor > end ? anchor - end : 0
        )))
    if (gap > bestGap) {
      bestGap = gap
      bestLane = lane
    }
  })

  return bestLane
}

/**
 * Pure event layout. Pixel coordinates and a text measurer are supplied by
 * the caller, so this module never reads document or canvas.
 */
export function tlLayout({
  events,
  width,
  capacity,
  markerWidth,
  measureText,
  labelFont,
  dateFont,
  clearance = 14,
}: TimelineLayoutInput): TimelineLayoutResult {
  const lanes = makeLanes(capacity)
  const spans: TimelineSpanPlacement[] = []
  const markers: TimelineMarkerPlacement[] = []
  const clusters: TimelineClusterPlacement[] = []
  let clusterIndex = 0

  const measured = (event: TimelineLayoutEvent) => ({
    labelWidth: measureText(event.title, labelFont),
    dateWidth: measureText(event.dateLabel, dateFont),
  })

  const placeSpans = (batch: TimelineLayoutEvent[]) => {
    batch
      .filter((event): event is TimelineLayoutEvent & { endX: number } => event.endX !== undefined)
      .sort((left, right) => left.startX - right.startX || left.id.localeCompare(right.id))
      .forEach((event) => {
      const startX = event.startX
      const endX = Math.max(event.endX, startX + 4)

      const { labelWidth, dateWidth } = measured(event)
      const rowWidth = labelWidth + 8 + dateWidth + 6
      const labelX = startX + 2
      let lane = place(
        lanes,
        Math.min(startX, labelX) - 2,
        Math.max(endX, labelX + rowWidth),
        clearance,
      )
      const labelled = lane >= 0

      if (lane < 0) lane = place(lanes, startX - 2, endX + 2, 6)
      if (lane < 0) lane = leastCrowded(lanes, startX)

      const boxStart = labelled ? Math.min(startX, labelX) : startX
      const boxEnd = labelled ? Math.max(endX, labelX + rowWidth) : endX
      spans.push({
        ...event,
        startX,
        endX,
        lane,
        labelX,
        labelled,
        labelWidth,
        dateWidth,
        intersectsCanvas: boxEnd >= 0 && boxStart <= width,
      })
    })
  }

  const placeMarkers = (batch: TimelineLayoutEvent[]) => {
    const leftovers: Array<{
      event: TimelineLayoutEvent
      x: number
      labelWidth: number
      dateWidth: number
    }> = []

    batch
      .filter((event) => event.endX === undefined)
      .sort((left, right) => left.startX - right.startX || left.id.localeCompare(right.id))
      .forEach((event) => {
      const x = event.startX

      const { labelWidth, dateWidth } = measured(event)
      const rowWidth = markerWidth + 8 + labelWidth + 8 + dateWidth
      const box: OccupiedBox = [x - markerWidth / 2 - 2, x + rowWidth]
      const lane = place(lanes, box[0], box[1], clearance)

      if (lane >= 0) {
        markers.push({
          ...event,
          x,
          lane,
          mode: 'label',
          labelWidth,
          dateWidth,
          intersectsCanvas: box[1] >= 0 && box[0] <= width,
        })
        return
      }

      const bareLane = place(lanes, x - markerWidth / 2 - 3, x + markerWidth / 2 + 3, 4)
      if (bareLane >= 0) {
        markers.push({
          ...event,
          x,
          lane: bareLane,
          mode: 'dot',
          labelWidth,
          dateWidth,
          intersectsCanvas: x + markerWidth / 2 >= 0 && x - markerWidth / 2 <= width,
        })
        return
      }

      leftovers.push({ event, x, labelWidth, dateWidth })
    })

    const groups: Array<{
      start: number
      end: number
      items: typeof leftovers
    }> = []
    leftovers
      .sort((left, right) => left.x - right.x)
      .forEach((item) => {
        const last = groups.at(-1)
        if (last !== undefined && item.x - last.end <= 20) {
          last.end = item.x
          last.items.push(item)
        } else {
          groups.push({ start: item.x, end: item.x, items: [item] })
        }
      })

    groups.forEach((group) => {
      const x = (group.start + group.end) / 2
      if (group.items.length === 1) {
        const item = group.items[0]!
        markers.push({
          ...item.event,
          x,
          lane: leastCrowded(lanes, x),
          mode: 'dot',
          labelWidth: item.labelWidth,
          dateWidth: item.dateWidth,
          intersectsCanvas: x + markerWidth / 2 >= 0 && x - markerWidth / 2 <= width,
        })
        return
      }

      const placedLane = place(lanes, x - 12, x + 12, 6)
      clusters.push({
        id: `cluster:${clusterIndex}:${group.items.map(({ event }) => event.id).join(':')}`,
        lane: placedLane >= 0 ? placedLane : leastCrowded(lanes, x),
        x,
        start: group.start,
        end: group.end,
        count: group.items.length,
        memberIds: group.items.map(({ event }) => event.id),
        intersectsCanvas: x + 12 >= 0 && x - 12 <= width,
      })
      clusterIndex += 1
    })
  }

  const attached = events.filter((event) => !event.isLibrary)
  const library = events.filter((event) => event.isLibrary)
  placeSpans(attached)
  placeMarkers(attached)
  placeSpans(library)
  placeMarkers(library)

  const placements = [...spans, ...markers, ...clusters]
  const laneCount = placements.length === 0
    ? 1
    : Math.max(...placements.map(({ lane }) => lane)) + 1

  return { spans, markers, clusters, laneCount }
}

// Typed aliases for the remaining pure geometry named in the design handoff.
export const tlCoord = historicalDateToCoordinate
export const tlTransform = createViewportTransform
export const tlTicks = buildRulerTicks
export const tlFit = fitRange
export const tlEpochLanes = assignEpochLanes
