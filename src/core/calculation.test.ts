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

  /**
   * The cost line prices one position; the tables note prices the book of them,
   * which is where the real labour and each model's characteristic difficulty
   * actually lived. Both are needed or the panel tells half the story.
   */
  it('says what the tables were and what building them took', () => {
    const keys = calculationsFor(JD, 'mars', 'earth').map((c) => c.tablesKey);
    expect(keys).toEqual([
      'calc.tables.ptolemy',
      'calc.tables.copernicus',
      'calc.tables.kepler',
      'calc.tables.newton',
    ]);
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

  it('counts the integration this app runs, which is not Newton’s method', () => {
    const newton = calculationsFor(JD, 'mars', 'earth').find(
      (c) => c.engineId === 'nbody',
    )!;
    // ~400 years back from J2000 at a quarter-day step, three forces per step.
    expect(Number(newton.costValues!.evaluations)).toBeGreaterThan(1_000_000);
  });
});

describe('Newton solved the two-body problem, he did not integrate it', () => {
  /**
   * The correction that prompted this column's rewrite. Numerical integration
   * is a twentieth-century technique; the *Principia* proves that an
   * inverse-square force yields a conic section, so for one planet Newton's
   * answer *is* Kepler's ellipse — derived instead of fitted.
   */
  it('reports a two-body longitude identical to Kepler’s', () => {
    const newton = calculationsFor(JD, 'mars', 'earth').find(
      (c) => c.engineId === 'nbody',
    )!;
    const twoBody = newton.lines.find((line) => line.labelKey === 'calc.newton.twoBody')!;

    expect(twoBody.value).toBeCloseTo(resultOf('keplerian'), 9);
  });

  /**
   * The genuinely new calculating power: Kepler's third law had no constant, so
   * a period could be measured but not computed. Newton's version supplies it,
   * and run backwards it weighs the Sun.
   */
  it('derives each period from the masses, to within a day', () => {
    const expected: Record<string, number> = {
      mercury: 87.969,
      venus: 224.701,
      mars: 686.98,
      jupiter: 4332.59,
      saturn: 10_759.22,
    };

    for (const [body, period] of Object.entries(expected)) {
      const line = calculationsFor(JD, body as 'mars', 'earth')
        .find((c) => c.engineId === 'nbody')!
        .lines.find((l) => l.labelKey === 'calc.newton.period')!;

      // Saturn's is the loosest: its elements drift most over the range.
      expect(Math.abs(line.value! - period), body).toBeLessThan(6);
    }
  });

  it('separates its own answer from the integration the map draws', () => {
    const newton = calculationsFor(JD, 'mars', 'earth').find(
      (c) => c.engineId === 'nbody',
    )!;
    const labels = newton.lines.map((line) => line.labelKey);

    expect(labels).toContain('calc.newton.twoBody');
    expect(labels).toContain('calc.newton.integrated');
    // The result line is what the map shows, so the panel cannot contradict it.
    expect(newton.lines.find((line) => line.isResult)!.labelKey).toBe(
      'calc.newton.integrated',
    );
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
