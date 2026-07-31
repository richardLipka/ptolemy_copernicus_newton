/**
 * The working has to be the *real* working.
 *
 * A panel of plausible-looking intermediate numbers would be worse than no panel
 * at all, so the thing that matters here is that each model's chain ends at the
 * longitude that model's engine actually produces — the same number the map is
 * drawing from.
 */

import { describe, expect, it } from 'vitest';

import { calculationsFor } from './calculation';
import { apparentLongitude } from './coordinates';
import { circularPositions } from './engines/circular';
import { keplerianPositions, solveKeplerTraced } from './engines/keplerian';
import { nbodyEngine } from './engines/nbody';
import { ptolemaicEpicyclicPositions } from './engines/ptolemaic';
import type { EngineId } from './engines/types';
import { jdFromCalendar } from './time';
import { normalizeDeg } from './vec';

const JD = jdFromCalendar(1602, 3, 3);

const resultOf = (engineId: EngineId, body: 'mars' | 'venus' = 'mars'): number =>
  calculationsFor(JD, body, 'earth')
    .find((calculation) => calculation.engineId === engineId)!
    .lines.find((line) => line.isResult)!.value!;

describe('the working ends where the engine does', () => {
  const engines: [EngineId, (jd: number) => ReturnType<typeof keplerianPositions>][] = [
    ['ptolemaic-epicyclic', ptolemaicEpicyclicPositions],
    ['circular', circularPositions],
    ['keplerian', keplerianPositions],
    ['nbody', (jd) => nbodyEngine.positionsAt(jd) as ReturnType<typeof keplerianPositions>],
  ];

  for (const [engineId, positionsAt] of engines) {
    it(`${engineId} reports the longitude its engine computes`, () => {
      const expected = normalizeDeg(apparentLongitude(positionsAt(JD), 'earth', 'mars'));
      expect(resultOf(engineId)).toBeCloseTo(expected, 9);
    });
  }
});

describe('the panel covers every model, oldest first', () => {
  it('runs Ptolemy, Copernicus, Kepler, Newton in that order', () => {
    expect(calculationsFor(JD, 'mars', 'earth').map((c) => c.engineId)).toEqual([
      'ptolemaic-epicyclic',
      'circular',
      'keplerian',
      'nbody',
    ]);
  });

  it('gives every model a result line and a statement of what it cost', () => {
    for (const calculation of calculationsFor(JD, 'mars', 'earth')) {
      expect(calculation.lines.some((line) => line.isResult), calculation.engineId).toBe(true);
      expect(calculation.costKey, calculation.engineId).toMatch(/^calc\.cost\./);
    }
  });
});

describe("the models' costs are the point", () => {
  /**
   * Kepler's equation is transcendental, so the count is never zero and never
   * one — there is always an iteration, which is the whole historical burden.
   */
  it('reports a real iteration count for Kepler', () => {
    const kepler = calculationsFor(JD, 'mars', 'earth').find(
      (c) => c.engineId === 'keplerian',
    )!;
    const iterations = Number(kepler.costValues!.iterations);
    expect(iterations).toBeGreaterThan(0);
    expect(iterations).toBeLessThan(32);
  });

  /** A rounder orbit converges sooner: Venus (e = 0.007) beats Mars (e = 0.093). */
  it('needs fewer passes for a rounder orbit', () => {
    const passes = (body: 'mars' | 'venus'): number =>
      Number(
        calculationsFor(JD, body, 'earth').find((c) => c.engineId === 'keplerian')!
          .costValues!.iterations,
      );
    expect(passes('venus')).toBeLessThanOrEqual(passes('mars'));
  });

  it('counts Newton’s integration steps, which dwarf everything else', () => {
    const newton = calculationsFor(JD, 'mars', 'earth').find(
      (c) => c.engineId === 'nbody',
    )!;
    const evaluations = Number(String(newton.costValues!.evaluations).replace(/\D/g, ''));
    // ~400 years back from J2000 at a quarter-day step, three forces per step.
    expect(evaluations).toBeGreaterThan(1_000_000);
  });
});

describe('solveKeplerTraced', () => {
  it('agrees with the untraced solver and converges', () => {
    const solution = solveKeplerTraced(87.5, 0.0934);
    expect(solution.iterations).toBeGreaterThan(0);
    expect(Math.abs(solution.finalCorrection)).toBeLessThan(1e-9);
  });

  /** A circular orbit is the degenerate case: E = M, found immediately. */
  it('has nothing to do when the orbit is a circle', () => {
    expect(solveKeplerTraced(42, 0).eccentricAnomaly).toBeCloseTo(42, 9);
  });
});
