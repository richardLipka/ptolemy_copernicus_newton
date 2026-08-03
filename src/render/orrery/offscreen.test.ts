/**
 * The edge pointers are pure geometry, and geometry in this project has a
 * history of looking right and being wrong. These pin the two properties that
 * matter — the pointer lies on the ray to the body, and it lands on the
 * viewport rectangle — plus the pan term, which the browser could not really
 * exercise: at the magnification the feature exists for, a full drag across the
 * screen moves the view by a thousandth of a map unit.
 */

import { describe, expect, it } from 'vitest';

import { EDGE_INSET, edgePointerFor, type Viewport } from './offscreen';

/** A wide-ish viewport centred on the frame origin, as at pan zero. */
const view: Viewport = { halfWidth: 2, halfHeight: 1, centre: { x: 0, y: 0 } };

const reachX = view.halfWidth * EDGE_INSET;
const reachY = view.halfHeight * EDGE_INSET;

describe('edgePointerFor', () => {
  it('gives no pointer for a body inside the viewport', () => {
    expect(edgePointerFor({ x: 0, y: 0 }, view)).toBeNull();
    expect(edgePointerFor({ x: reachX - 0.01, y: reachY - 0.01 }, view)).toBeNull();
  });

  it('gives no pointer for a body exactly on the inset boundary', () => {
    // The boundary is inclusive, or a body could flicker between the two
    // treatments while drifting along it.
    expect(edgePointerFor({ x: reachX, y: 0 }, view)).toBeNull();
    expect(edgePointerFor({ x: 0, y: reachY }, view)).toBeNull();
  });

  it.each([
    ['right', { x: 40, y: 0 }, { x: reachX, y: 0 }, 0],
    ['left', { x: -40, y: 0 }, { x: -reachX, y: 0 }, 180],
    ['bottom', { x: 0, y: 40 }, { x: 0, y: reachY }, 90],
    ['top', { x: 0, y: -40 }, { x: 0, y: -reachY }, -90],
  ])('places a pointer on the %s edge', (_side, body, at, angle) => {
    const pointer = edgePointerFor(body, view);
    expect(pointer).not.toBeNull();
    expect(pointer!.at.x).toBeCloseTo(at.x, 12);
    expect(pointer!.at.y).toBeCloseTo(at.y, 12);
    expect(pointer!.angleDeg).toBeCloseTo(angle, 12);
  });

  it('leaves through whichever side the ray actually crosses', () => {
    // The viewport is twice as wide as it is tall, so a body at 45° exits the
    // top or bottom, not the side — the naive "largest component wins" test
    // would get this backwards.
    const pointer = edgePointerFor({ x: 30, y: 30 }, view)!;
    expect(pointer.at.y).toBeCloseTo(reachY, 12);
    expect(pointer.at.x).toBeCloseTo(reachY, 12);
    expect(Math.abs(pointer.at.x)).toBeLessThan(reachX);
  });

  it('keeps the pointer on the ray from the middle of the screen to the body', () => {
    // The whole point of the pointer is the direction it indicates, so this is
    // the property to hold: same bearing, from the same origin.
    const bodies = [
      { x: 7, y: 3 },
      { x: -11, y: 4 },
      { x: 2.5, y: -9 },
      { x: -0.3, y: -8 },
    ];
    for (const body of bodies) {
      const pointer = edgePointerFor(body, view)!;
      const toBody = Math.atan2(body.y - view.centre.y, body.x - view.centre.x);
      const toPointer = Math.atan2(
        pointer.at.y - view.centre.y,
        pointer.at.x - view.centre.x,
      );
      expect(toPointer).toBeCloseTo(toBody, 12);
      expect(pointer.outward.x).toBeCloseTo(Math.cos(toBody), 12);
      expect(pointer.outward.y).toBeCloseTo(Math.sin(toBody), 12);
    }
  });

  it('returns a unit outward vector', () => {
    const pointer = edgePointerFor({ x: 13, y: -29 }, view)!;
    expect(Math.hypot(pointer.outward.x, pointer.outward.y)).toBeCloseTo(1, 12);
  });

  it('measures from the middle of the screen, not the frame origin', () => {
    /*
     * With the view panned so its middle sits on the body, the body is on
     * screen — even though it is far from the origin. Measuring from the origin
     * instead would draw a pointer to a body sitting under the crosshairs.
     */
    const panned: Viewport = { ...view, centre: { x: 50, y: 50 } };
    expect(edgePointerFor({ x: 50, y: 50 }, panned)).toBeNull();

    // And the pointer for something off-screen rides the panned centre.
    const pointer = edgePointerFor({ x: 90, y: 50 }, panned)!;
    expect(pointer.at.x).toBeCloseTo(50 + reachX, 12);
    expect(pointer.at.y).toBeCloseTo(50, 12);
  });

  it('survives a body sitting exactly on the screen middle', () => {
    // Degenerate ray: no direction to point in, but it must not produce NaN.
    const pointer = edgePointerFor({ x: 0, y: 0 }, view);
    expect(pointer).toBeNull();
  });

  it('stays inside the viewport for every bearing', () => {
    // A pointer drawn outside the stage is clipped away and the body vanishes
    // silently, which is the failure this feature exists to prevent.
    for (let degrees = 0; degrees < 360; degrees += 1) {
      const radians = (degrees * Math.PI) / 180;
      const body = { x: Math.cos(radians) * 1000, y: Math.sin(radians) * 1000 };
      const pointer = edgePointerFor(body, view)!;
      expect(pointer).not.toBeNull();
      expect(Math.abs(pointer.at.x)).toBeLessThanOrEqual(reachX + 1e-12);
      expect(Math.abs(pointer.at.y)).toBeLessThanOrEqual(reachY + 1e-12);
      // and on the boundary, not floating somewhere in the middle
      const onEdge =
        Math.abs(Math.abs(pointer.at.x) - reachX) < 1e-12 ||
        Math.abs(Math.abs(pointer.at.y) - reachY) < 1e-12;
      expect(onEdge).toBe(true);
    }
  });
});
