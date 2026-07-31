import { epochLabelPlacement, MIN_EPOCH_LABEL_WIDTH_PX } from './epoch-label';

describe('epochLabelPlacement', () => {
  it('leaves the title at the band start while that start is on screen', () => {
    expect(epochLabelPlacement({ left: 120, right: 480, width: 1000 })).toEqual({
      offset: 0,
      maxWidth: 360,
      visible: true,
    });
  });

  it('clamps the title to the viewport when the band overflows both edges', () => {
    expect(epochLabelPlacement({ left: -400, right: 1400, width: 1000 })).toEqual({
      offset: 400,
      maxWidth: 1000,
      visible: true,
    });
  });

  it('hides the title when the band is entirely left of the viewport', () => {
    expect(epochLabelPlacement({ left: -900, right: -200, width: 1000 })).toEqual({
      offset: 900,
      maxWidth: 0,
      visible: false,
    });
  });

  it('hides the title when the visible slice is narrower than the threshold', () => {
    expect(
      epochLabelPlacement({
        left: 1000 - (MIN_EPOCH_LABEL_WIDTH_PX - 1),
        right: 1200,
        width: 1000,
      }),
    ).toEqual({
      offset: 0,
      maxWidth: MIN_EPOCH_LABEL_WIDTH_PX - 1,
      visible: false,
    });
  });

  it('shows the title at exactly the threshold width', () => {
    expect(
      epochLabelPlacement({
        left: 1000 - MIN_EPOCH_LABEL_WIDTH_PX,
        right: 1200,
        width: 1000,
      }).visible,
    ).toBe(true);
  });
});
