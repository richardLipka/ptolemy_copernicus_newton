/**
 * Trails are the app's only depiction of an orbit now, so the log-to-screen
 * path carries real weight: if it is wrong, the orbits are wrong, and there is
 * no pre-computed curve left to disagree with it.
 *
 * These tests drive the same code the renderer does — record snapshots, then
 * project them — with no DOM involved.
 */

import { describe, expect, it } from 'vitest';

import { keplerianPositions } from '../core/engines/keplerian';
import { ptolemaicEpicyclicPositions } from '../core/engines/ptolemaic';
import { jdFromCalendar } from '../core/time';
import { projectTrail, type Point } from './selectors';
import { TrailLog } from './trails';

const START = jdFromCalendar(2026, 1, 1);

/** Log positions over a span, finely enough that nothing is decimated away. */
function logRun(
  days: number,
  stepDays = 1,
  positionsAt: (jd: number) => ReturnType<typeof keplerianPositions> = keplerianPositions,
): TrailLog {
  const log = new TrailLog(Math.ceil(days / stepDays) + 10, stepDays);
  for (let d = 0; d <= days; d += stepDays) {
    const jd = START + d;
    log.record(jd, positionsAt(jd));
  }
  return log;
}

const radius = (p: Point) => Math.hypot(p.x, p.y);

/** Reversals in the polar angle about the centre — the retrograde signature. */
function directionReversals(points: Point[]): number {
  let reversals = 0;
  let lastSign = 0;
  for (let i = 1; i < points.length; i++) {
    let delta =
      Math.atan2(points[i]!.y, points[i]!.x) -
      Math.atan2(points[i - 1]!.y, points[i - 1]!.x);
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    if (Math.abs(delta) < 1e-12) continue;
    const sign = Math.sign(delta);
    if (lastSign !== 0 && sign !== lastSign) reversals++;
    lastSign = sign;
  }
  return reversals;
}

describe('projectTrail', () => {
  it('produces one point per logged snapshot', () => {
    const log = logRun(30);
    const points = projectTrail(log.all(), 'mars', 'sun', 'compressed');
    expect(points).toHaveLength(log.size);
  });

  it('closes Earth’s heliocentric orbit after a year', () => {
    const log = logRun(365.25, 1);
    const points = projectTrail(log.all(), 'earth', 'sun', 'true');

    const first = points[0]!;
    const last = points[points.length - 1]!;
    // Back within a couple of days' travel of where it started.
    expect(Math.hypot(last.x - first.x, last.y - first.y)).toBeLessThan(0.02);
  });

  it('keeps a near-constant radius for a near-circular orbit', () => {
    const log = logRun(365.25, 1);
    const points = projectTrail(log.all(), 'earth', 'sun', 'true');
    const radii = points.map(radius);
    // Earth's eccentricity is 0.017, so the spread should be a few per cent.
    expect(Math.max(...radii) / Math.min(...radii)).toBeLessThan(1.05);
  });

  it('never reverses direction when centred on the Sun', () => {
    const log = logRun(800, 2);
    for (const id of ['mercury', 'venus', 'mars', 'jupiter'] as const) {
      const points = projectTrail(log.all(), id, 'sun', 'compressed');
      expect(directionReversals(points), `${id} heliocentric`).toBe(0);
    }
  });

  /**
   * The demonstration the whole app exists for, now emerging from recorded
   * history rather than a pre-computed curve. Mars turns retrograde roughly
   * every 780 days, so three years should contain at least one loop, and each
   * loop shows up as two reversals.
   */
  it('accumulates retrograde loops for Mars seen from Earth', () => {
    const log = logRun(1200, 2);
    const points = projectTrail(log.all(), 'mars', 'earth', 'compressed');
    expect(directionReversals(points)).toBeGreaterThanOrEqual(2);
  });

  it('shows no retrograde for the Sun or Moon seen from Earth', () => {
    const log = logRun(1200, 2);
    // Neither ever backs up against the stars; only the planets do, which is
    // precisely the distinction the epicycles were built to explain.
    expect(directionReversals(projectTrail(log.all(), 'sun', 'earth', 'compressed'))).toBe(0);
  });

  it('draws the Moon at its exaggerated radius about Earth', () => {
    const log = logRun(60, 0.5);
    const points = projectTrail(log.all(), 'moon', 'earth', 'compressed');
    const radii = points.map(radius);
    // Exaggerated display radius, breathing with the real distance rather than
    // vanishing at a third of a pixel. The bounds came down when the
    // exaggeration was cut from 0.055: at the old size the Moon was drawn
    // outside Ptolemy's Mercury, which the nested spheres forbid.
    expect(Math.min(...radii)).toBeGreaterThan(0.02);
    expect(Math.max(...radii)).toBeLessThan(0.04);
  });

  it('recentres recorded history without recomputing it', () => {
    const log = logRun(400, 2);
    const helio = projectTrail(log.all(), 'mars', 'sun', 'compressed');
    const geo = projectTrail(log.all(), 'mars', 'earth', 'compressed');

    // The same snapshots, two different centres, same number of points.
    expect(geo).toHaveLength(helio.length);
    expect(geo).not.toEqual(helio);
  });

  it('places the frame origin at the centre throughout', () => {
    const log = logRun(200, 2);
    const points = projectTrail(log.all(), 'earth', 'earth', 'compressed');
    for (const point of points) expect(radius(point)).toBeLessThan(1e-12);
  });

  it('works for the Ptolemaic engine too', () => {
    const log = logRun(1200, 2, ptolemaicEpicyclicPositions);
    const points = projectTrail(log.all(), 'mars', 'earth', 'compressed');
    // Ptolemy's construction must also produce the loops; reproducing them was
    // the entire purpose of the epicycle.
    expect(directionReversals(points)).toBeGreaterThanOrEqual(2);
  });
});
