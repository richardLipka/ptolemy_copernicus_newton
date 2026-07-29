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
   * The epicyclic engine anchors Venus's deferent at the Sun's distance with
   * Ptolemy's published epicycle ratio, which lets Venus reach the far side of
   * its epicycle and therefore show a full disc.
   *
   * That is *not* the cosmology Galileo refuted. In Ptolemy's nested spheres
   * Venus's shell lies wholly inside the Sun's, so Venus could never pass
   * beyond it and could never be more than a crescent. Reproducing that would
   * mean modelling the nesting, not just the angular construction — the
   * construction alone gets longitudes right and says nothing about distance,
   * which is exactly why the phases were decisive and the longitudes were not.
   */
  it('shows a full Venus, because the engine models angles and not the nested spheres', () => {
    const range = venusPhaseRange(ptolemaicEpicyclicPositions);
    expect(range.max).toBeGreaterThan(0.9);
  });
});
