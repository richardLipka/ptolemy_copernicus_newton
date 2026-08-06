import { describe, expect, it } from 'vitest';

import { apparentLongitude } from '../coordinates.js';
import { jdFromCalendar } from '../time.js';
import { angleDiffDeg } from '../vec.js';
import { keplerianPositions } from './keplerian.js';
import { vsop87Positions } from './vsop87.js';
import {
  ptolemaicEpicyclicPositions,
  ptolemaicReframePositions,
} from './ptolemaic.js';

const SAMPLE_JDS = [
  jdFromCalendar(1600, 1, 1),
  jdFromCalendar(1700, 5, 20),
  jdFromCalendar(1800, 9, 9),
  jdFromCalendar(1900, 2, 14),
  jdFromCalendar(2000, 1, 1),
  jdFromCalendar(2100, 11, 30),
  jdFromCalendar(2250, 7, 4),
  jdFromCalendar(2400, 1, 1),
];

/**
 * Largest error in apparent geocentric longitude across the sample dates,
 * measured against the reference ephemeris.
 */
function worstLongitudeError(
  body: Parameters<typeof apparentLongitude>[2],
  positionsAt: (jd: number) => ReturnType<typeof keplerianPositions>,
): number {
  let worst = 0;
  for (const jd of SAMPLE_JDS) {
    const truth = apparentLongitude(vsop87Positions(jd), 'earth', body);
    const modelled = apparentLongitude(positionsAt(jd), 'earth', body);
    worst = Math.max(worst, Math.abs(angleDiffDeg(modelled, truth)));
  }
  return worst;
}

describe('reframe sub-mode', () => {
  it('reproduces true geocentric longitudes exactly', () => {
    for (const body of ['sun', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'] as const) {
      expect(worstLongitudeError(body, ptolemaicReframePositions)).toBeLessThan(1e-9);
    }
  });

  it('puts Earth at the origin', () => {
    const earth = ptolemaicReframePositions(SAMPLE_JDS[0]!).get('earth')!;
    expect(Math.hypot(earth.x, earth.y, earth.z)).toBe(0);
  });
});

describe('epicyclic sub-mode', () => {
  // Ptolemy's planetary longitudes were good to a couple of degrees for the
  // superior planets and notably worse for Mercury. Bounds that hold across
  // 1600-2400 confirm the construction is right without pretending it is
  // more accurate than it was.
  const tolerance: Record<string, number> = {
    sun: 1,
    venus: 4,
    mars: 6,
    jupiter: 3,
    saturn: 3,
    mercury: 12,
  };

  for (const [body, limit] of Object.entries(tolerance)) {
    it(`places ${body} within ${limit} deg of the true longitude`, () => {
      const error = worstLongitudeError(
        body as Parameters<typeof apparentLongitude>[2],
        ptolemaicEpicyclicPositions,
      );
      expect(error).toBeLessThan(limit);
    });
  }

  it('is genuinely less accurate than the reframe, or it is not modelling Ptolemy', () => {
    const epicyclic = worstLongitudeError('mars', ptolemaicEpicyclicPositions);
    expect(epicyclic).toBeGreaterThan(0.1);
  });

  it('reproduces the Moon\'s equation of centre to about 5 degrees', () => {
    let worst = 0;
    for (const jd of SAMPLE_JDS) {
      const truth = apparentLongitude(keplerianPositions(jd), 'earth', 'moon');
      const modelled = apparentLongitude(ptolemaicEpicyclicPositions(jd), 'earth', 'moon');
      worst = Math.max(worst, Math.abs(angleDiffDeg(modelled, truth)));
    }
    // The omitted crank costs up to ~2.5 deg beyond the simple model's own error.
    expect(worst).toBeLessThan(8);
  });
});
