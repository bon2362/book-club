import { reduceDensity } from './density';

const points = [
  { id: 'a', x: 10, label: 'Alexander the Great' },
  { id: 'b', x: 14, label: 'Battle of Issus' },
  { id: 'c', x: 80, label: 'Founding' },
];

describe('reduceDensity', () => {
  it('keeps full labels at the full-label stage', () => {
    expect(reduceDensity(points, { stage: 'full-label' })).toEqual([
      { type: 'point', id: 'a', x: 10, label: 'Alexander the Great' },
      { type: 'point', id: 'b', x: 14, label: 'Battle of Issus' },
      { type: 'point', id: 'c', x: 80, label: 'Founding' },
    ]);
  });

  it('shortens labels at the shortened-label stage', () => {
    expect(reduceDensity(points, { stage: 'shortened-label', maxLabelLength: 8 })).toEqual([
      { type: 'point', id: 'a', x: 10, label: 'Alexand…' },
      { type: 'point', id: 'b', x: 14, label: 'Battle …' },
      { type: 'point', id: 'c', x: 80, label: 'Founding' },
    ]);
  });

  it('hides labels but retains markers at the marker-only stage', () => {
    expect(reduceDensity(points, { stage: 'marker-only' })).toEqual([
      { type: 'point', id: 'a', x: 10 },
      { type: 'point', id: 'b', x: 14 },
      { type: 'point', id: 'c', x: 80 },
    ]);
  });

  it('clusters nearby unselected points with click bounds and member IDs', () => {
    expect(reduceDensity(points, { stage: 'cluster', clusterPixelWidth: 10 })).toEqual([
      {
        type: 'cluster',
        id: 'cluster:a:b',
        x: 12,
        count: 2,
        start: 10,
        end: 14,
        memberIds: ['a', 'b'],
      },
      { type: 'point', id: 'c', x: 80 },
    ]);
  });

  it('keeps a selected point separate when nearby points are clustered', () => {
    expect(
      reduceDensity(
        [
          { id: 'a', x: 10, label: 'Alexander the Great', selected: true },
          { id: 'b', x: 14, label: 'Battle of Issus' },
        ],
        { stage: 'cluster', clusterPixelWidth: 10 },
      ),
    ).toEqual([
      { type: 'point', id: 'a', x: 10, selected: true },
      { type: 'point', id: 'b', x: 14 },
    ]);
  });

  it('disables clustering when the timeline requests all points', () => {
    expect(
      reduceDensity(points, {
        stage: 'cluster',
        clusterPixelWidth: 10,
        showAll: true,
      }),
    ).toEqual([
      { type: 'point', id: 'a', x: 10 },
      { type: 'point', id: 'b', x: 14 },
      { type: 'point', id: 'c', x: 80 },
    ]);
  });
});
