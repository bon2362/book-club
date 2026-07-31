/**
 * Below this visible width an epoch band carries no title: a one-letter
 * ellipsis reads as noise, so the band stays a plain coloured stripe.
 */
export const MIN_EPOCH_LABEL_WIDTH_PX = 64;

export interface EpochLabelInput {
  /** Band start in viewport pixels. Negative when the epoch begins off screen. */
  left: number;
  /** Band end in viewport pixels. Greater than `width` when it ends off screen. */
  right: number;
  /** Visible timeline width in pixels. */
  width: number;
}

export interface EpochLabelPlacement {
  /** Horizontal inset of the title inside its own band. */
  offset: number;
  /** Maximum title width — the width of the band's visible slice. */
  maxWidth: number;
  visible: boolean;
}

/**
 * Places an epoch title in the intersection of its band and the viewport, so a
 * band reaching past either edge stays named without moving its true bounds.
 */
export function epochLabelPlacement({
  left,
  right,
  width,
}: EpochLabelInput): EpochLabelPlacement {
  const visibleLeft = Math.max(left, 0);
  const visibleRight = Math.min(right, width);
  const maxWidth = Math.max(0, visibleRight - visibleLeft);

  return {
    offset: visibleLeft - left,
    maxWidth,
    visible: maxWidth >= MIN_EPOCH_LABEL_WIDTH_PX,
  };
}
