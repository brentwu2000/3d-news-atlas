/**
 * Pointer gesture arbitration. R3F reports `event.delta` on click: the
 * distance in CSS pixels between pointerdown and pointerup. Anything at or
 * beyond the threshold was an orbit/pan/pinch, not a selection.
 */
export const DRAG_THRESHOLD_PX = 6;

export function isTap(deltaPx: number | undefined): boolean {
  return typeof deltaPx === "number" && Number.isFinite(deltaPx) && deltaPx < DRAG_THRESHOLD_PX;
}
