/**
 * Galileo's observation, as each model reproduces it.
 *
 * The phases of Venus were the observation that broke the geocentric system.
 * This test pins down what each engine here actually predicts, so that claims
 * made about it elsewhere in the source stay honest.
 */

import { describe, expect, it } from 'vitest';

import { circularPositions } from './engines/circular';
import { keplerianPositions } from './engines/keplerian';
import { ptolemaicEpicyclicPositions } from './engines/ptolemaic';
import type { PositionSet } from './engines/types';
import { illuminationOf } from './illumination';
import { jdFromCalendar } from './time';

function venusPhaseRange(positionsAt: (jd: number) => PositionSet): {
  min: number;
  max: number;
  maxDistance: number;
} {
  let min = 1;
  let max = 0;
  let maxDistance = 0;

  // A little over one synodic period, sampled daily.
  const start = jdFromCalendar(2024, 1, 1);
  for (let jd = start; jd < start + 600; jd += 1) {
    const positions = positionsAt(jd);
    const illumination = illuminationOf(positions, 'earth', 'venus');
    min = Math.min(min, illumination.illuminatedFraction);
    max = Math.max(max, illumination.illuminatedFraction);

    const earth = positions.get('earth')!;
    const venus = positions.get('venus')!;
    maxDistance = Math.max(
      maxDistance,
      Math.hypot(venus.x - earth.x, venus.y - earth.y, venus.z - earth.z),
    );
  }

  return { min, max, maxDistance };
}

describe('phases of Venus', () => {
  it('runs the full cycle from new to full in reality', () => {
    const range = venusPhaseRange(keplerianPositions);
    expect(range.min).toBeLessThan(0.02);
    expect(range.max).toBeGreaterThan(0.99);
    // At superior conjunction Venus is beyond the Sun, over 1.7 AU away.
    expect(range.maxDistance).toBeGreaterThan(1.7);
  });

  it('does the same under Copernicus, as it must', () => {
    const range = venusPhaseRange(circularPositions);
    expect(range.min).toBeLessThan(0.02);
    expect(range.max).toBeGreaterThan(0.99);
  });

  /**
   * The observation that broke the model, reproduced.
   *
   * With the deferents scaled to Ptolemy's nested spheres, Venus's shell lies
   * wholly inside the Sun's, so Venus can never pass beyond the Sun and can
   * never turn more than half its lit face toward us. The disc waxes to a fat
   * crescent and then wanes again — and that is what Galileo's telescope
   * refuted when it showed Venus full and small.
   *
   * The nesting matters and the angular construction alone does not produce it:
   * the Almagest fixes only r/R and says nothing about absolute distance, which
   * is exactly why the phases were decisive where the longitudes were not.
   */
  it('never lets Venus pass half-lit, which is what Galileo refuted', () => {
    const range = venusPhaseRange(ptolemaicEpicyclicPositions);
    expect(range.max).toBeLessThan(0.5);
    // It does still go through new, so the crescent cycle is intact.
    expect(range.min).toBeLessThan(0.02);
  });

  it('keeps Venus inside the Sun’s sphere at all times', () => {
    const start = jdFromCalendar(2024, 1, 1);
    for (let d = 0; d < 900; d += 1) {
      const positions = ptolemaicEpicyclicPositions(start + d);
      const earth = positions.get('earth')!;
      const distance = (id: 'venus' | 'sun'): number => {
        const body = positions.get(id)!;
        return Math.hypot(body.x - earth.x, body.y - earth.y, body.z - earth.z);
      };
      expect(distance('venus'), `day ${d}`).toBeLessThan(distance('sun'));
    }
  });

  it('keeps the superior planets outside it', () => {
    // The other half of the nesting: Mars can never come nearer than the Sun.
    const start = jdFromCalendar(2024, 1, 1);
    for (let d = 0; d < 900; d += 3) {
      const positions = ptolemaicEpicyclicPositions(start + d);
      const earth = positions.get('earth')!;
      const distance = (id: 'mars' | 'sun'): number => {
        const body = positions.get(id)!;
        return Math.hypot(body.x - earth.x, body.y - earth.y, body.z - earth.z);
      };
      expect(distance('mars'), `day ${d}`).toBeGreaterThan(distance('sun'));
    }
  });
});
