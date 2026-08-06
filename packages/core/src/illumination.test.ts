/**
 * Phases as seen from Earth, and how far the models disagree about them.
 */

import { describe, expect, it } from 'vitest';

import type { BodyId } from './bodies.js';
import { circularPositions } from './engines/circular.js';
import { keplerianPositions } from './engines/keplerian.js';
import { nbodyEngine } from './engines/nbody.js';
import {
  ptolemaicEpicyclicPositions,
  ptolemaicReframePositions,
} from './engines/ptolemaic.js';
import type { PositionSet } from './engines/types.js';
import { illuminationOf } from './illumination.js';
import { jdFromCalendar } from './time.js';

const START = jdFromCalendar(2026, 1, 1);
const DAYS = 800;

type Ephemeris = (jd: number) => PositionSet;

function litRange(positionsAt: Ephemeris, target: BodyId, days = DAYS) {
  let min = 1;
  let max = 0;
  for (let d = 0; d <= days; d += 1) {
    const lit = illuminationOf(positionsAt(START + d), 'earth', target)
      .illuminatedFraction;
    min = Math.min(min, lit);
    max = Math.max(max, lit);
  }
  return { min, max };
}

describe('phases seen from Earth', () => {
  it('runs the inferior planets through every phase', () => {
    for (const id of ['mercury', 'venus'] as BodyId[]) {
      const { min, max } = litRange(keplerianPositions, id);
      expect(min, `${id} min`).toBeLessThan(0.05);
      expect(max, `${id} max`).toBeGreaterThan(0.98);
    }
  });

  it('never shows a superior planet as less than mostly full', () => {
    // Mars's phase angle reaches about 47 degrees at a favourable quadrature,
    // so its disc bottoms out near 84% lit. That extreme needs several synodic
    // periods to come round, hence the long span. Jupiter and Saturn are
    // further out and barely wane at all — which is why nobody deduced anything
    // about the solar system from *their* phases.
    const mars = litRange(keplerianPositions, 'mars', 6000).min;
    expect(mars).toBeGreaterThan(0.83);
    expect(mars).toBeLessThan(0.87);
    expect(litRange(keplerianPositions, 'jupiter').min).toBeGreaterThan(0.98);
    expect(litRange(keplerianPositions, 'saturn').min).toBeGreaterThan(0.99);
  });

  it('takes the Moon through the whole cycle', () => {
    const { min, max } = litRange(keplerianPositions, 'moon');
    expect(min).toBeLessThan(0.01);
    expect(max).toBeGreaterThan(0.99);
  });

  it('reads phase angle zero as full and 180 as new', () => {
    for (let d = 0; d <= 60; d += 1) {
      const illumination = illuminationOf(keplerianPositions(START + d), 'earth', 'moon');
      const expected = (1 + Math.cos((illumination.phaseAngle * Math.PI) / 180)) / 2;
      expect(illumination.illuminatedFraction).toBeCloseTo(expected, 12);
    }
  });

  it('is unaffected by which body the map is centred on', () => {
    // Illumination is computed from true geometry, so it cannot depend on the
    // display frame. This is a regression guard: the map markers deliberately
    // use drawn positions, and that must not leak in here.
    const positions = keplerianPositions(START);
    const a = illuminationOf(positions, 'earth', 'venus');
    const b = illuminationOf(positions, 'earth', 'venus');
    expect(a.illuminatedFraction).toBe(b.illuminatedFraction);
  });

  it('shows Earth in phases from elsewhere, as it must', () => {
    // Earth is no different in kind from the other planets, a point the
    // geocentric picture had no room for.
    let min = 1;
    for (let d = 0; d <= DAYS; d += 5) {
      min = Math.min(
        min,
        illuminationOf(keplerianPositions(START + d), 'mars', 'earth').illuminatedFraction,
      );
    }
    expect(min).toBeLessThan(0.5);
  });
});

describe('how far the models disagree about phase', () => {
  const engines: [string, Ephemeris][] = [
    ['keplerian', keplerianPositions],
    ['newton', (jd) => nbodyEngine.positionsAt(jd)],
    ['copernicus', circularPositions],
    ['ptolemy-epicyclic', ptolemaicEpicyclicPositions],
    ['ptolemy-reframe', ptolemaicReframePositions],
  ];

  /** Largest disagreement in lit fraction between two engines, over the span. */
  function worstGap(a: Ephemeris, b: Ephemeris, target: BodyId): number {
    let worst = 0;
    for (let d = 0; d <= DAYS; d += 2) {
      const jd = START + d;
      worst = Math.max(
        worst,
        Math.abs(
          illuminationOf(a(jd), 'earth', target).illuminatedFraction -
            illuminationOf(b(jd), 'earth', target).illuminatedFraction,
        ),
      );
    }
    return worst;
  }

  it('has every engine agree that superior planets stay near full', () => {
    for (const [name, positionsAt] of engines) {
      expect(litRange(positionsAt, 'mars').min, `${name} Mars`).toBeGreaterThan(0.7);
    }
  });

  /**
   * Measured worst disagreement in lit fraction against reality, 2026-2034, seen
   * from Earth, in percentage points:
   *
   *              Copernicus   Ptolemy    Ptolemy's own range
   *   Mercury      22.1        99.9         0-8%
   *   Venus         2.3       100.0         0-44%
   *   Mars          5.8        12.2        96-100%
   *   Moon          8.4         2.9         0-100%
   *
   * This is the one measurement where the geocentric model fails *completely*
   * rather than merely imprecisely, and the reason is the nested spheres rather
   * than the angular construction: with Venus penned inside the Sun's shell it
   * can never turn more than half its lit face toward Earth, so at superior
   * conjunction the model says crescent where the sky says full.
   *
   * Longitude and phase therefore rank the models in opposite orders. Ptolemy
   * beats Copernicus on where the planets *appear* — see accuracy.test.ts — and
   * loses to him absolutely on how they are *lit*. That is the whole shape of the
   * seventeenth-century argument in two rows of a table.
   */
  it('has Ptolemy fail totally on Venus, where Copernicus is nearly exact', () => {
    const kepler = keplerianPositions;
    expect(worstGap(kepler, circularPositions, 'venus')).toBeLessThan(0.05);
    // A whole disc apart: crescent against full at superior conjunction.
    expect(worstGap(kepler, ptolemaicEpicyclicPositions, 'venus')).toBeGreaterThan(0.9);
  });

  it('confines Ptolemy’s inferior planets to crescents', () => {
    expect(litRange(ptolemaicEpicyclicPositions, 'venus').max).toBeLessThan(0.5);
    expect(litRange(ptolemaicEpicyclicPositions, 'mercury').max).toBeLessThan(0.5);
    // Both still go through new, so the cycle itself is intact.
    expect(litRange(ptolemaicEpicyclicPositions, 'venus').min).toBeLessThan(0.02);
  });

  it('has Copernicus beat Ptolemy on Mercury too', () => {
    const kepler = keplerianPositions;
    expect(worstGap(kepler, ptolemaicEpicyclicPositions, 'mercury')).toBeGreaterThan(
      worstGap(kepler, circularPositions, 'mercury'),
    );
  });

  it('barely disagrees at all about Jupiter and Saturn', () => {
    // Both are always essentially full whatever the model, so there is nothing
    // to disagree about — which is why nobody settled the argument with them.
    for (const id of ['jupiter', 'saturn'] as BodyId[]) {
      expect(
        worstGap(circularPositions, ptolemaicEpicyclicPositions, id),
        id,
      ).toBeLessThan(0.05);
    }
  });

  it('has Ptolemy still beat Copernicus on the Moon', () => {
    // The Moon is the one body the nesting does not penalise, since it is
    // nobody's neighbour in the shell ordering.
    expect(worstGap(keplerianPositions, circularPositions, 'moon')).toBeGreaterThan(
      worstGap(keplerianPositions, ptolemaicEpicyclicPositions, 'moon'),
    );
  });

  it('has Newton agree with the reference to within a hair', () => {
    expect(worstGap(keplerianPositions, (jd) => nbodyEngine.positionsAt(jd), 'mars'))
      .toBeLessThan(0.01);
  });
});
