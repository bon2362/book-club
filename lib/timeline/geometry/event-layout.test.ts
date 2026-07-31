import {
  buildEventLayout,
  estimateEventLabelTextWidth,
  estimateEventRowWidth,
  finishedIntervalCollisionBox,
} from './event-layout';

const densePoints = [
  { id: 'a', x: 10, label: 'Alexander the Great' },
  { id: 'b', x: 14, label: 'Battle of Issus' },
  { id: 'c', x: 18, label: 'Founding' },
];

describe('buildEventLayout', () => {
  it('extends a finished interval collision box through its visible title', () => {
    const box = finishedIntervalCollisionBox({
      id: 'narrow',
      start: 100,
      end: 112,
      label: 'Long campaign',
    });

    expect(box.start).toBe(100);
    expect(box.end).toBeGreaterThan(112);
    expect(box.end).toBeGreaterThanOrEqual(100 + 214);
  });

  it('keeps a wide finished interval collision box at its true end', () => {
    expect(
      finishedIntervalCollisionBox({
        id: 'wide',
        start: 100,
        end: 500,
        label: 'Short',
      }),
    ).toEqual({ id: 'wide', start: 100, end: 500 });
  });

  it('reserves conservative width and the row chrome for wide glyph labels', () => {
    expect(estimateEventRowWidth('W漢😀')).toBeCloseTo(92.5);

    const layout = buildEventLayout({
      points: [
        { id: 'wide', x: 0, label: 'W漢😀' },
        { id: 'neighbor', x: 75, label: 'B' },
      ],
      intervalBoxes: [],
      preferredStage: 'full-label',
      showAll: false,
      laneCapacity: 2,
      horizontalClearance: 0,
    });

    expect(layout.stage).toBe('full-label');
    expect(layout.laneCount).toBe(2);
  });

  it.each([
    ['lowercase m', 'm'.repeat(16)],
    ['lowercase w', 'w'.repeat(16)],
    ['Cyrillic', 'Ж'.repeat(16)],
    ['emoji', '😀'.repeat(16)],
  ])(
    'keeps one deterministic Unicode upper bound per glyph for %s',
    (_label, value) => {
      expect(estimateEventLabelTextWidth(value)).toBeCloseTo(152);
      expect(estimateEventRowWidth(value)).toBeCloseTo(216);
    },
  );

  it('keeps every lane assignment identical across a pure pan', () => {
    const data: Array<[string, number, string]> = [
      ['thirty-years', 1618, 'Тридцатилетняя война'],
      ['jesuit', 1632, 'Реляции иезуитов'],
      ['leviathan', 1651, 'Левиафан, Гоббс'],
      ['spinoza', 1675, 'Политический трактат, Спиноза'],
      ['locke', 1689, 'Два трактата о правлении, Локк'],
      ['lahontan', 1703, 'New Voyages to North America, Lahontan'],
      ['leibniz', 1714, 'Монадология, Лейбниц'],
      ['montesquieu', 1748, 'О духе законов, Монтескье'],
      ['rousseau', 1754, 'Рассуждение о происхождении и основании неравенства'],
      ['smith', 1759, 'Теория нравственных чувств, Смит'],
    ];
    const lanesAtPan = (startYear: number) =>
      Object.fromEntries(
        buildEventLayout({
          points: data.map(([id, year, label]) => ({
            id,
            label,
            x: (year - startYear) * 10,
          })),
          intervalBoxes: [],
          preferredStage: 'full-label',
          showAll: true,
          laneCapacity: 40,
          horizontalClearance: 12,
        }).placements.map(({ id, lane }) => [id, lane]),
      );

    // Panning moves every marker by the same amount, so nothing may reshuffle:
    // layout depends on the data and the zoom, never on the scroll position.
    const reference = lanesAtPan(1400);
    for (let startYear = 1402; startYear <= 1800; startYear += 2) {
      expect(lanesAtPan(startYear)).toEqual(reference);
    }
  });

  it('advances density until the layout fits available lanes', () => {
    const layout = buildEventLayout({
      points: densePoints,
      intervalBoxes: [],
      preferredStage: 'full-label',
      showAll: false,
      laneCapacity: 1,
      horizontalClearance: 12,
    });

    expect(layout.stage).toBe('cluster');
    expect(layout.markers).toHaveLength(1);
    expect(layout.laneCount).toBe(1);
  });

  it('keeps marker-only output instead of clustering when show all is enabled', () => {
    const layout = buildEventLayout({
      points: densePoints,
      intervalBoxes: [],
      preferredStage: 'marker-only',
      showAll: true,
      laneCapacity: 1,
      horizontalClearance: 12,
    });

    expect(layout.stage).toBe('marker-only');
    expect(layout.markers).toHaveLength(3);
    expect(layout.laneCount).toBeGreaterThan(1);
  });

  it('keeps the selected point separate from a nearby cluster', () => {
    const layout = buildEventLayout({
      points: [
        { ...densePoints[0]!, selected: true },
        densePoints[1]!,
        densePoints[2]!,
      ],
      intervalBoxes: [],
      preferredStage: 'cluster',
      showAll: false,
      laneCapacity: 2,
      horizontalClearance: 12,
    });

    expect(layout.markers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'point', id: 'a', selected: true }),
        expect.objectContaining({ type: 'cluster', count: 2 }),
      ]),
    );
  });

  it.each(['a', 'c'])(
    'keeps the remaining cluster in lane zero when %s is selected',
    (selectedId) => {
      const layout = buildEventLayout({
        points: densePoints.map((point) => ({
          ...point,
          ...(point.id === selectedId ? { selected: true } : {}),
        })),
        intervalBoxes: [],
        preferredStage: 'cluster',
        showAll: false,
        laneCapacity: 2,
        horizontalClearance: 12,
      });

      const remainingCluster = layout.markers.find(
        (marker) => marker.type === 'cluster',
      );

      expect(remainingCluster).toBeDefined();
      expect(
        layout.placements.find(({ id }) => id === remainingCluster!.id),
      ).toEqual({ id: remainingCluster!.id, lane: 0 });
    },
  );
});
