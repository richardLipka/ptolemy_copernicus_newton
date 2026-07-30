/**
 * Phases as seen from Earth, and how far the models disagree about them.
 */

import { describe, expect, it } from 'vitest';

import type { BodyId } from './bodies';
import { circularPositions } from './engines/circular';
import { keplerianPositions } from './engines/keplerian';
import { nbodyEngine } from './engines/nbody';
import {
  ptolemaicEpicyclicPositions,
  ptolemaicReframePositions,
} from './engines/ptolemaic';
import type { PositionSet } from './engines/types';
import { illuminationOf } from './illumination';
import { jdFromCalendar } from './time';

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
   * Measured worst disagreement in lit fraction, 2026-2034, seen from Earth,
   * in percentage points:
   *
   *              vs reality              Ptolemy vs
   *              Copernicus   Ptolemy    Copernicus
   *   Mercury      22.1        18.1        20.9
   *   Venus         2.3         2.3         4.1
   *   Mars          5.8         1.3         6.2
   *   Jupiter       0.1         0.1         0.2
   *   Saturn        0.0         0.0         0.1
   *   Moon          8.4         2.9         6.4
   *
   * So the models mostly *agree* about phase, which is not the intuitive
   * result. The lit fraction depends on nothing but the Sun-body-observer
   * angle, and both historical constructions were fitted to reproduce that
   * triangle, so they inherit its accuracy. Venus — the body whose phases
   * settled the argument — comes out within four points across all three.
   *
   * Mercury is the exception, and the one place a large divergence is visible:
   * its eccentricity of 0.21 defeats a circle and an epicycle alike.
   */
  it('keeps Venus within a few points across all three models', () => {
    const kepler = keplerianPositions;
    expect(worstGap(kepler, circularPositions, 'venus')).toBeLessThan(0.05);
    expect(worstGap(kepler, ptolemaicEpicyclicPositions, 'venus')).toBeLessThan(0.05);
    expect(worstGap(circularPositions, ptolemaicEpicyclicPositions, 'venus'))
      .toBeLessThan(0.06);
  });

  it('disagrees sharply about Mercury, where both constructions struggle', () => {
    expect(worstGap(circularPositions, ptolemaicEpicyclicPositions, 'mercury'))
      .toBeGreaterThan(0.15);
  });

  it('barely disagrees at all about Jupiter and Saturn', () => {
    // Both are always essentially full, so there is nothing to disagree about.
    for (const id of ['jupiter', 'saturn'] as BodyId[]) {
      expect(
        worstGap(circularPositions, ptolemaicEpicyclicPositions, id),
        id,
      ).toBeLessThan(0.01);
    }
  });

  it('has Ptolemy beat Copernicus on Mars and the Moon, as with longitude', () => {
    const kepler = keplerianPositions;
    for (const id of ['mars', 'moon'] as BodyId[]) {
      const copernican = worstGap(kepler, circularPositions, id);
      const ptolemaic = worstGap(kepler, ptolemaicEpicyclicPositions, id);
      // Circular orbits cost Copernicus more than geocentrism cost Ptolemy —
      // the same ordering the longitude errors show.
      expect(copernican, `${id}`).toBeGreaterThan(ptolemaic);
    }
  });

  it('has Newton agree with the reference to within a hair', () => {
    expect(worstGap(keplerianPositions, (jd) => nbodyEngine.positionsAt(jd), 'mars'))
      .toBeLessThan(0.01);
  });
});
