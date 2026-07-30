/**
 * Sight-line geometry.
 *
 * A sight-line has two jobs: connect the observer to the body, and mark where
 * that body appears on the zodiac. The first version silently did neither
 * exactly, because two distortions sit between them — the parallax of a
 * finite ring whose divisions are measured from the centre, and the compressed
 * scale's mangling of angles measured from anywhere else.
 *
 * Both vanish only when the observer *is* the frame origin, which is why the
 * lines are straight in Ptolemy's view and nowhere else. These tests fix that
 * behaviour in place.
 */

import { describe, expect, it } from 'vitest';

import type { BodyId } from '../core/bodies';
import { apparentLongitude } from '../core/coordinates';
import { keplerianPositions } from '../core/engines/keplerian';
import { jdFromCalendar } from '../core/time';
import { normalizeDeg } from '../core/vec';
import { projectPositions, ringIntercept, type Point } from './selectors';

const JD = jdFromCalendar(2026, 1, 1);
const RING_INNER = 1.06;
const PLANETS: BodyId[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];

const angleOf = (from: Point, to: Point) =>
  (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;

/** Smallest absolute difference between two bearings, degrees. */
function bearingGap(a: number, b: number): number {
  const d = normalizeDeg(a - b);
  return Math.min(d, 360 - d);
}

describe('the pip marks the true apparent longitude', () => {
  it('sits on the ring at the body’s apparent longitude, in every frame', () => {
    const positions = keplerianPositions(JD);

    for (const frameOrigin of ['sun', 'earth', 'mars'] as BodyId[]) {
      for (const id of PLANETS) {
        if (id === frameOrigin) continue;
        const longitude = apparentLongitude(positions, 'earth', id);
        const pip = ringIntercept(longitude, RING_INNER);

        // On the ring, and at the right absolute angle — that is what makes the
        // zodiac reading correct regardless of where the map is centred.
        expect(Math.hypot(pip.x, pip.y)).toBeCloseTo(RING_INNER, 12);
        expect(bearingGap(angleOf({ x: 0, y: 0 }, pip), longitude)).toBeLessThan(1e-9);
      }
    }
  });
});

describe('a single straight line to the ring cannot reach the body', () => {
  /**
   * This is the defect the two-segment form replaced, kept as a measurement so
   * nobody reintroduces it thinking it was only a rounding matter.
   *
   * A line from the observer to the ring point at absolute λ misses the body by
   * a wide margin whenever the observer is off-centre — and, crucially, misses
   * it even at true scale, where a uniform scaling preserves every angle. That
   * residual is the ring's parallax, and it is what made the original version
   * wrong in Copernicus and Newton while looking perfect in Ptolemy.
   */
  /**
   * Worst miss over a span, not at one instant. The geometry at a single date
   * says little — the bodies happen to be wherever they are, and the miss can
   * be near zero by coincidence.
   */
  const worstMiss = (
    scale: 'compressed' | 'true',
    frameOrigin: BodyId,
    id: BodyId,
  ): number => {
    let worst = 0;
    for (let d = 0; d < 700; d += 5) {
      const positions = keplerianPositions(JD + d);
      const projected = projectPositions(positions, frameOrigin, scale);
      const observer = projected.get('earth')!;
      const body = projected.get(id)!;
      const longitude = apparentLongitude(positions, 'earth', id);
      worst = Math.max(
        worst,
        bearingGap(
          angleOf(observer, ringIntercept(longitude, RING_INNER)),
          angleOf(observer, body),
        ),
      );
    }
    return worst;
  };

  it('misses badly when the observer is off-centre', () => {
    for (const id of ['mercury', 'venus', 'mars'] as BodyId[]) {
      // Thresholds are loose because the exact angles depend on
      // SYSTEM_RADIUS_AU: enlarging it to cover Ptolemy's nested spheres pulled
      // everything inward and shrank the parallax with it. The claim under test
      // is that a single straight line misses by a wide margin, not any
      // particular figure.
      expect(worstMiss('compressed', 'sun', id), `${id}`).toBeGreaterThan(6);
    }
  });

  it('still misses at true scale, which is the parallax term', () => {
    // Purely the finite ring: nothing to do with compression, and the reason
    // the original version was wrong even where the scale was honest.
    for (const id of ['venus', 'mars'] as BodyId[]) {
      expect(worstMiss('true', 'sun', id), `${id}`).toBeGreaterThan(1);
    }
  });

  it('hits exactly when the observer is the frame origin', () => {
    for (const scale of ['compressed', 'true'] as const) {
      for (const id of PLANETS) {
        expect(worstMiss(scale, 'earth', id), `${id}`).toBeLessThan(1e-6);
      }
    }
  });
});

describe('why the line is straight only for Ptolemy', () => {
  /**
   * With the observer at the centre, radial compression preserves its
   * directions exactly and the ring's absolute angles are the observer's own
   * angles. So the drawn bearing to the body equals the apparent longitude, and
   * the whole sight-line is straight.
   */
  it('has zero bend when the observer is the frame origin', () => {
    const positions = keplerianPositions(JD);

    for (const scale of ['compressed', 'true'] as const) {
      const projected = projectPositions(positions, 'earth', scale);
      const observer = projected.get('earth')!;
      expect(Math.hypot(observer.x, observer.y)).toBe(0);

      for (const id of PLANETS) {
        const body = projected.get(id)!;
        const longitude = apparentLongitude(positions, 'earth', id);
        const inner = angleOf(observer, body);
        const outer = angleOf(body, ringIntercept(longitude, RING_INNER));
        expect(bearingGap(inner, outer), `${id} ${scale}`).toBeLessThan(1e-6);
      }
    }
  });

  it('bends once the observer is off-centre, and far less at true scale', () => {
    const worstBend = (scale: 'compressed' | 'true', id: BodyId): number => {
      let worst = 0;
      for (let d = 0; d < 700; d += 5) {
        const positions = keplerianPositions(JD + d);
        const projected = projectPositions(positions, 'sun', scale);
        const observer = projected.get('earth')!;
        const body = projected.get(id)!;
        const longitude = apparentLongitude(positions, 'earth', id);
        worst = Math.max(
          worst,
          bearingGap(
            angleOf(observer, body),
            angleOf(body, ringIntercept(longitude, RING_INNER)),
          ),
        );
      }
      return worst;
    };

    // Saturn is excluded: it lies almost on the ring, so its outer segment is a
    // stub whose direction is ill-conditioned — a large measured angle over a
    // visually negligible length.
    for (const id of ['mercury', 'venus', 'mars'] as BodyId[]) {
      const compressed = worstBend('compressed', id);
      const trueScale = worstBend('true', id);
      // Loose for the same reason as above — the figure tracks SYSTEM_RADIUS_AU.
      expect(compressed, `${id} compressed`).toBeGreaterThan(12);
      expect(trueScale, `${id} true`).toBeLessThan(compressed);
    }
  });
});
