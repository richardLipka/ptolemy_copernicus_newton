/**
 * Cross-model accuracy comparison.
 *
 * These assertions encode the app's central historical claim, so a regression
 * here means the demonstration itself has broken: Copernicus was *not* more
 * accurate than Ptolemy. Heliocentrism alone bought no precision, because
 * circular orbits cost more than geocentrism did. That only changed with
 * Kepler's ellipses.
 */

import { describe, expect, it } from 'vitest';

import type { BodyId } from '../bodies';
import { apparentLongitude } from '../coordinates';
import { jdFromCalendar } from '../time';
import { angleDiffDeg } from '../vec';
import { circularPositions } from './circular';
import { keplerianPositions } from './keplerian';
import { ptolemaicEpicyclicPositions } from './ptolemaic';

const SAMPLE_JDS = [1600, 1700, 1800, 1900, 2000, 2100, 2250, 2400].map((year) =>
  jdFromCalendar(year, 1, 1),
);

function worstError(
  body: BodyId,
  positionsAt: (jd: number) => ReturnType<typeof keplerianPositions>,
): number {
  let worst = 0;
  for (const jd of SAMPLE_JDS) {
    const truth = apparentLongitude(keplerianPositions(jd), 'earth', body);
    const modelled = apparentLongitude(positionsAt(jd), 'earth', body);
    worst = Math.max(worst, Math.abs(angleDiffDeg(modelled, truth)));
  }
  return worst;
}

describe('Ptolemy versus Copernicus', () => {
  // The superior planets are where Copernicus's circles hurt most, because a
  // circular orbit misplaces the planet by roughly 2e radians and Mars has the
  // largest eccentricity of the three.
  for (const body of ['mars', 'jupiter', 'saturn'] as const) {
    it(`predicts ${body} better under Ptolemy than under Copernicus`, () => {
      expect(worstError(body, ptolemaicEpicyclicPositions)).toBeLessThan(
        worstError(body, circularPositions),
      );
    });
  }

  it('costs Copernicus more than 10 deg on Mars', () => {
    expect(worstError('mars', circularPositions)).toBeGreaterThan(10);
  });

  it('keeps Ptolemy within a few degrees on Mars', () => {
    expect(worstError('mars', ptolemaicEpicyclicPositions)).toBeLessThan(4);
  });
});

describe('both models stay within their historical accuracy', () => {
  const bounds: Partial<Record<BodyId, { ptolemy: number; copernicus: number }>> = {
    sun: { ptolemy: 1, copernicus: 1 },
    mercury: { ptolemy: 8, copernicus: 8 },
    venus: { ptolemy: 3, copernicus: 2 },
    mars: { ptolemy: 4, copernicus: 16 },
    jupiter: { ptolemy: 2, copernicus: 9 },
    saturn: { ptolemy: 4, copernicus: 9 },
    moon: { ptolemy: 4, copernicus: 9 },
  };

  for (const [body, limit] of Object.entries(bounds) as [
    BodyId,
    { ptolemy: number; copernicus: number },
  ][]) {
    it(`bounds ${body}`, () => {
      expect(worstError(body, ptolemaicEpicyclicPositions)).toBeLessThan(limit.ptolemy);
      expect(worstError(body, circularPositions)).toBeLessThan(limit.copernicus);
    });
  }
});
