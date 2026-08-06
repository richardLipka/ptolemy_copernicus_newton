/**
 * Where to draw a body that has been zoomed off the edge of the map.
 *
 * True scale plus a deep zoom is the case this exists for. The Moon sits
 * 0.000147 of the map radius from the Earth, so seeing its orbit at all takes
 * several hundred times magnification — and at that magnification every planet
 * is outside the viewport. A map that simply loses them gives no way to tell
 * which way anything lies, which is exactly the sense the app is meant to build.
 *
 * Kept separate from the renderer because it is pure geometry and the project
 * has been bitten before by projection arithmetic that only looked right.
 */

import type { Point } from '../../state/selectors';

/**
 * How much of the half-width the pointer is pulled in from the true edge.
 *
 * The chevron has a size and the name is set beside it; placed exactly on the
 * boundary both would be half cut off by the stage's overflow clip.
 */
export const EDGE_INSET = 0.92;

/** The visible rectangle, in map units, and where its middle sits. */
export interface Viewport {
  /** Half the viewport width in map units — screen pixels over `--unit`. */
  halfWidth: number;
  halfHeight: number;
  /**
   * The map point at the middle of the screen.
   *
   * A body renders at `centre + (p + pan) · unit`, so the map point in the
   * middle of the screen is `−pan`, whatever the magnification.
   */
  centre: Point;
}

export interface EdgePointer {
  /** Where the chevron goes: on the inset rectangle, in map units. */
  at: Point;
  /** Bearing of the body from the middle of the screen, degrees, for the chevron. */
  angleDeg: number;
  /**
   * Unit vector from the screen middle towards the body — which is to say, off
   * the map. The name is pushed back along it so it stays inside.
   */
  outward: Point;
}

const DEGREES_PER_RADIAN = 180 / Math.PI;

/**
 * A pointer for `body`, or `null` when it is comfortably on screen.
 *
 * The pointer is placed where the ray from the middle of the screen to the body
 * crosses the inset rectangle, so it preserves the direction to the body — the
 * one thing it is there to convey.
 */
export const edgePointerFor = (body: Point, view: Viewport): EdgePointer | null => {
  const awayX = body.x - view.centre.x;
  const awayY = body.y - view.centre.y;
  const reachX = view.halfWidth * EDGE_INSET;
  const reachY = view.halfHeight * EDGE_INSET;

  if (Math.abs(awayX) <= reachX && Math.abs(awayY) <= reachY) return null;

  /*
   * Scale the ray down until it lands on the rectangle. Taking the smaller of
   * the two ratios picks whichever side it leaves through; the guard is for a
   * body exactly on an axis, where the other component is zero.
   */
  const reach = Math.min(
    reachX / Math.max(Math.abs(awayX), Number.MIN_VALUE),
    reachY / Math.max(Math.abs(awayY), Number.MIN_VALUE),
  );

  const span = Math.hypot(awayX, awayY) || 1;
  return {
    at: { x: view.centre.x + awayX * reach, y: view.centre.y + awayY * reach },
    angleDeg: Math.atan2(awayY, awayX) * DEGREES_PER_RADIAN,
    outward: { x: awayX / span, y: awayY / span },
  };
};
