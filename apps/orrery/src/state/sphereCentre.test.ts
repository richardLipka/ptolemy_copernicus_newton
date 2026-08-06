/**
 * The celestial sphere centred on the observer.
 *
 * The point of the option is that a sight-line becomes a single straight ray at
 * the body's true apparent longitude, in any model. That works because the ring's
 * divisions are absolute ecliptic longitudes whichever point they are measured
 * from — so moving the sphere onto the observer is a translation, and the
 * parallax between "direction λ from here" and "the point at angle λ on the ring"
 * disappears.
 *
 * The residual under the compressed scale is a separate matter: compression
 * preserves directions only from the frame origin, so the ray still need not pass
 * through the marker. At true scale it does, exactly, and these tests hold both
 * halves of that in place.
 */

import { describe, expect, it } from 'vitest';

import type { BodyId } from '@orrery/core/bodies';
import { apparentLongitude } from '@orrery/core/coordinates';
import { keplerianPositions } from '@orrery/core/engines/keplerian';
import { jdFromCalendar } from '@orrery/core/time';
import { normalizeDeg } from '@orrery/core/vec';
import { projectPositions, ringIntercept, type Point } from './selectors';

const JD = jdFromCalendar(2026, 1, 1);
const RING_INNER = 1.06;
const PLANETS: BodyId[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];

const bearing = (from: Point, to: Point) =>
  normalizeDeg((Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI);

function bearingGap(a: number, b: number): number {
  const d = normalizeDeg(a - b);
  return Math.min(d, 360 - d);
}

/** Pip position when the sphere is centred on the observer. */
function observerCentredPip(observer: Point, longitude: number): Point {
  const ray = ringIntercept(longitude, RING_INNER);
  return { x: observer.x + ray.x, y: observer.y + ray.y };
}

describe('sphere centred on the observer', () => {
  it('puts the pip exactly one ring radius from the observer', () => {
    const positions = keplerianPositions(JD);
    for (const frameOrigin of ['sun', 'earth', 'jupiter'] as BodyId[]) {
      const projected = projectPositions(positions, frameOrigin, 'compressed');
      const observer = projected.get('earth')!;

      for (const id of PLANETS) {
        const longitude = apparentLongitude(positions, 'earth', id);
        const pip = observerCentredPip(observer, longitude);
        expect(
          Math.hypot(pip.x - observer.x, pip.y - observer.y),
          `${id} from ${frameOrigin}`,
        ).toBeCloseTo(RING_INNER, 12);
      }
    }
  });

  it('aims the ray at the true apparent longitude, in every frame and scale', () => {
    const positions = keplerianPositions(JD);

    for (const scale of ['compressed', 'true'] as const) {
      for (const frameOrigin of ['sun', 'earth', 'mars'] as BodyId[]) {
        const projected = projectPositions(positions, frameOrigin, scale);
        const observer = projected.get('earth')!;

        for (const id of PLANETS) {
          const longitude = apparentLongitude(positions, 'earth', id);
          const pip = observerCentredPip(observer, longitude);
          // This is what makes the zodiac reading correct: the ring's divisions
          // are absolute longitudes measured from its centre, which is now the
          // observer, so a ray at bearing λ lands in the division holding λ.
          expect(
            bearingGap(bearing(observer, pip), longitude),
            `${id} ${frameOrigin} ${scale}`,
          ).toBeLessThan(1e-9);
        }
      }
    }
  });

  it('passes exactly through the body at true scale', () => {
    // The combination worth recommending: one straight line from the observer,
    // through the planet, to the right point on the zodiac.
    const positions = keplerianPositions(JD);
    const projected = projectPositions(positions, 'sun', 'true');
    const observer = projected.get('earth')!;

    for (const id of PLANETS) {
      const longitude = apparentLongitude(positions, 'earth', id);
      const pip = observerCentredPip(observer, longitude);
      const miss = bearingGap(
        bearing(observer, pip),
        bearing(observer, projected.get(id)!),
      );
      expect(miss, id).toBeLessThan(1e-6);
    }
  });

  it('still misses the marker under compression, by less than the old bend', () => {
    const positions = keplerianPositions(JD);
    const projected = projectPositions(positions, 'sun', 'compressed');
    const observer = projected.get('earth')!;

    for (const id of ['mercury', 'venus', 'mars'] as BodyId[]) {
      const longitude = apparentLongitude(positions, 'earth', id);
      const pip = observerCentredPip(observer, longitude);
      const miss = bearingGap(
        bearing(observer, pip),
        bearing(observer, projected.get(id)!),
      );
      // Only the compression term remains; the parallax term is gone.
      expect(miss, id).toBeLessThan(30);
    }
  });

  it('is identical to frame-centred when the observer is the frame origin', () => {
    const positions = keplerianPositions(JD);
    const projected = projectPositions(positions, 'earth', 'compressed');
    const observer = projected.get('earth')!;
    expect(Math.hypot(observer.x, observer.y)).toBe(0);

    for (const id of PLANETS) {
      const longitude = apparentLongitude(positions, 'earth', id);
      const centred = ringIntercept(longitude, RING_INNER);
      const shifted = observerCentredPip(observer, longitude);
      expect(Math.hypot(shifted.x - centred.x, shifted.y - centred.y), id).toBe(0);
    }
  });
});
