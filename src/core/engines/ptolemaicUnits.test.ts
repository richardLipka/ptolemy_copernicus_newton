/**
 * The claim these readouts make is that they are Ptolemy's own numbers. That is
 * checkable: expressed in parts of a deferent of 60, the geocentric distance of
 * each body must range over exactly the interval the Almagest's parameters
 * imply — 60 ± (e + r) — and nothing else.
 */

import { describe, expect, it } from 'vitest';

import type { BodyId } from '../bodies';
import { jdFromCalendar } from '../time';
import { DEFERENT_PARTS, inDeferentParts } from './ptolemaicUnits';
import { ptolemaicEpicyclicPositions } from './ptolemaic';

const JD = jdFromCalendar(2026, 8, 3);

/**
 * Almagest parameters, as stated by Ptolemy in sixtieths of a deferent.
 * Restated here rather than imported so the test is a check against the source
 * text, not a restatement of the engine's own table.
 */
const ALMAGEST: Record<string, { eccentricity: number; epicycle: number }> = {
  mercury: { eccentricity: 3.0, epicycle: 22.5 },
  venus: { eccentricity: 1.25, epicycle: 43.17 },
  mars: { eccentricity: 6.0, epicycle: 39.5 },
  jupiter: { eccentricity: 2.75, epicycle: 11.5 },
  saturn: { eccentricity: 3.4167, epicycle: 6.5 },
};

/** Geocentric distance of a body, in AU, under the epicyclic construction. */
function geocentricAu(jd: number, id: BodyId): number {
  const positions = ptolemaicEpicyclicPositions(jd);
  const body = positions.get(id)!;
  const earth = positions.get('earth')!;
  return Math.hypot(body.x - earth.x, body.y - earth.y, body.z - earth.z);
}

describe('inDeferentParts', () => {
  it('puts every planet inside the interval its Almagest parameters allow', () => {
    /*
     * Earth sits e from the deferent centre and the planet r from the epicycle
     * centre, so the geocentric distance can never leave 60 ± (e + r). A figure
     * outside that bracket would mean the readout and the construction disagree.
     */
    for (const [id, model] of Object.entries(ALMAGEST)) {
      const reach = model.eccentricity + model.epicycle;
      // A year of dates, so each body works round its deferent and epicycle.
      for (let day = 0; day < 365 * 3; day += 11) {
        const jd = JD + day;
        const parts = inDeferentParts(geocentricAu(jd, id as BodyId), jd, id as BodyId)!;
        expect(parts).not.toBeNull();
        expect(parts).toBeGreaterThanOrEqual(DEFERENT_PARTS - reach - 1e-6);
        expect(parts).toBeLessThanOrEqual(DEFERENT_PARTS + reach + 1e-6);
      }
    }
  });

  it('actually reaches both ends of that interval over a long enough span', () => {
    // Otherwise the bracket above would pass on a readout stuck at 60.
    for (const [id, model] of Object.entries(ALMAGEST)) {
      const reach = model.eccentricity + model.epicycle;
      let least = Infinity;
      let greatest = -Infinity;
      for (let day = 0; day < 365 * 32; day += 7) {
        const jd = JD + day;
        const parts = inDeferentParts(geocentricAu(jd, id as BodyId), jd, id as BodyId)!;
        least = Math.min(least, parts);
        greatest = Math.max(greatest, parts);
      }
      // Within a tenth of a part of the extremes the parameters predict.
      expect(least).toBeLessThan(DEFERENT_PARTS - reach + 0.1);
      expect(greatest).toBeGreaterThan(DEFERENT_PARTS + reach - 0.1);
    }
  });

  it('reads the deferent itself as exactly 60 parts', () => {
    // The definition, and the one value that must come out round.
    for (const id of Object.keys(ALMAGEST)) {
      const oneDeferent = inDeferentParts(
        // Feed it the deferent radius by asking for the parts of 1 AU and
        // inverting — any length scaled to the deferent must read 60.
        1 / (inDeferentParts(1, JD, id as BodyId)! / DEFERENT_PARTS),
        JD,
        id as BodyId,
      )!;
      expect(oneDeferent).toBeCloseTo(DEFERENT_PARTS, 9);
    }
  });

  it('places the Moon near 60 parts, as Almagest IV has it', () => {
    /*
     * Ptolemy's simple lunar model is a concentric deferent with an epicycle of
     * 5;15, so the Moon runs 60 ± 5.25 parts — and his mean lunar distance of
     * about 59 Earth radii was one of the Almagest's genuine successes.
     */
    const parts = inDeferentParts(geocentricAu(JD, 'moon'), JD, 'moon')!;
    expect(parts).toBeGreaterThan(DEFERENT_PARTS - 5.25 - 1e-6);
    expect(parts).toBeLessThan(DEFERENT_PARTS + 5.25 + 1e-6);
  });

  it('has no reading for the Earth, which is the centre and not a body on a circle', () => {
    expect(inDeferentParts(1, JD, 'earth')).toBeNull();
  });

  it('is scale-free, which is the whole point of the unit', () => {
    /*
     * Ptolemy could not have fixed the absolute size of any deferent, because
     * scaling a deferent, its eccentricity and its epicycle together changes no
     * direction seen from Earth. The unit inherits that: doubling a length
     * doubles its reading, and no absolute anchor appears anywhere.
     */
    const one = inDeferentParts(1, JD, 'mars')!;
    expect(inDeferentParts(2, JD, 'mars')!).toBeCloseTo(one * 2, 9);
    expect(inDeferentParts(0.5, JD, 'mars')!).toBeCloseTo(one / 2, 9);
  });

  it('refuses a non-finite length rather than printing one', () => {
    expect(inDeferentParts(Number.NaN, JD, 'mars')).toBeNull();
    expect(inDeferentParts(Number.POSITIVE_INFINITY, JD, 'mars')).toBeNull();
  });
});
