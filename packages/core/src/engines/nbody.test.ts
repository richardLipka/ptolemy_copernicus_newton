import { describe, expect, it } from 'vitest';

import type { BodyId } from '../bodies';
import { apparentLongitude, toSpherical } from '../coordinates';
import { J2000, calendarFromJd, jdFromCalendar } from '../time';
import { angleDiffDeg, length, sub } from '../vec';
import { keplerianPositions } from './keplerian';
import { NBodySimulation, toHeliocentric } from './nbody';
import type { PositionSet } from './types';

const RANGE_YEARS = [1600, 1700, 1800, 1900, 2100, 2200, 2300, 2400];

describe('integrator properties', () => {
  it('conserves energy over a century', () => {
    const sim = new NBodySimulation();
    const before = sim.totalEnergy();
    sim.advanceTo(J2000 + 36_525);
    expect(Math.abs((sim.totalEnergy() - before) / before)).toBeLessThan(1e-6);
  });

  it('is time-reversible: forward then back returns to the start', () => {
    const sim = new NBodySimulation();
    const start = sim.positionsAt(J2000).get('mars')!;
    sim.advanceTo(J2000 + 5000);
    sim.advanceTo(J2000);
    expect(length(sub(sim.positionsAt(J2000).get('mars')!, start))).toBeLessThan(1e-6);
  });

  it('keeps every planet on its own orbit across the full range', () => {
    const sim = new NBodySimulation();
    const expectedRadii: Partial<Record<BodyId, [number, number]>> = {
      mercury: [0.3, 0.47],
      venus: [0.71, 0.73],
      earth: [0.98, 1.02],
      mars: [1.38, 1.67],
      jupiter: [4.95, 5.46],
      saturn: [9.0, 10.1],
    };

    for (const year of [1600, 2400]) {
      const positions = toHeliocentric(sim.positionsAt(jdFromCalendar(year, 1, 1)));
      for (const [body, range] of Object.entries(expectedRadii) as [BodyId, [number, number]][]) {
        const radius = toSpherical(positions.get(body)!).distance;
        expect(radius).toBeGreaterThan(range[0]);
        expect(radius).toBeLessThan(range[1]);
      }
    }
  });

  it('keeps the Moon bound to Earth across the full range', () => {
    const sim = new NBodySimulation();
    for (const year of RANGE_YEARS) {
      const positions = sim.positionsAt(jdFromCalendar(year, 1, 1));
      const separation = length(sub(positions.get('moon')!, positions.get('earth')!));
      expect(separation).toBeGreaterThan(0.0022);
      expect(separation).toBeLessThan(0.0029);
    }
  });
});

describe('agreement with the reference ephemeris', () => {
  // The whole app rests on this. Newton mode is compared against models that
  // are wrong by 3-13 degrees, so its own error has to stay far below that or
  // the comparison measures the integrator instead of the historical models.
  const tolerance: Partial<Record<BodyId, number>> = {
    mercury: 0.2,
    venus: 0.2,
    earth: 0.2,
    mars: 0.2,
    jupiter: 0.5,
    saturn: 0.8,
    moon: 8,
  };

  it('tracks apparent longitudes across 1600-2400', () => {
    const sim = new NBodySimulation();

    for (const year of RANGE_YEARS) {
      const jd = jdFromCalendar(year, 1, 1);
      const modelled = sim.positionsAt(jd);
      const truth = keplerianPositions(jd);

      for (const [body, limit] of Object.entries(tolerance) as [BodyId, number][]) {
        if (body === 'earth') continue;
        const error = Math.abs(
          angleDiffDeg(
            apparentLongitude(modelled, 'earth', body),
            apparentLongitude(truth, 'earth', body),
          ),
        );
        expect(error, `${body} at ${year}`).toBeLessThan(limit);
      }
    }
  }, 120_000);
});

describe('historically recorded events', () => {
  function findJupiterSaturnConjunction(
    positionsAt: (jd: number) => PositionSet,
    aroundJd: number,
  ): number {
    const separation = (jd: number): number =>
      angleDiffDeg(
        apparentLongitude(positionsAt(jd), 'earth', 'jupiter'),
        apparentLongitude(positionsAt(jd), 'earth', 'saturn'),
      );

    let previousJd = aroundJd - 400;
    let previous = separation(previousJd);
    for (let jd = aroundJd - 395; jd < aroundJd + 400; jd += 5) {
      const current = separation(jd);
      if (Math.sign(current) !== Math.sign(previous) && Math.abs(current - previous) < 90) {
        let low = previousJd;
        let high = jd;
        for (let i = 0; i < 60; i++) {
          const mid = (low + high) / 2;
          if (Math.sign(separation(mid)) === Math.sign(separation(low))) low = mid;
          else high = mid;
        }
        return (low + high) / 2;
      }
      previousJd = jd;
      previous = current;
    }
    return NaN;
  }

  // Great conjunctions of Jupiter and Saturn. The 1603 one is the conjunction
  // Kepler observed, and which sent him looking for the star of Bethlehem.
  const recorded: [number, number, number][] = [
    [1603, 12, 17],
    [1623, 7, 16],
    [2020, 12, 21],
  ];

  it('places the great conjunctions within a few days', () => {
    const sim = new NBodySimulation();

    for (const [year, month, day] of recorded) {
      const expected = jdFromCalendar(year, month, day);
      const kepler = findJupiterSaturnConjunction(keplerianPositions, expected);
      const newton = findJupiterSaturnConjunction((jd) => sim.positionsAt(jd), expected);

      expect(Math.abs(kepler - expected), `kepler ${year}`).toBeLessThan(3);
      expect(Math.abs(newton - expected), `newton ${year}`).toBeLessThan(4);
    }
  }, 120_000);

  it('reproduces retrograde motion of Mars around the 2020 opposition', () => {
    const sim = new NBodySimulation();
    const before = apparentLongitude(sim.positionsAt(jdFromCalendar(2020, 10, 8)), 'earth', 'mars');
    const after = apparentLongitude(sim.positionsAt(jdFromCalendar(2020, 10, 18)), 'earth', 'mars');
    expect(angleDiffDeg(after, before)).toBeLessThan(0);
  });

  it('puts the 2020 Mars opposition in mid-October', () => {
    const sim = new NBodySimulation();
    // Opposition is where Mars's longitude equals the Sun's plus 180, so the
    // signed difference from that point crosses zero.
    const offsetFromOpposition = (jd: number): number => {
      const positions = sim.positionsAt(jd);
      return angleDiffDeg(
        apparentLongitude(positions, 'earth', 'mars'),
        apparentLongitude(positions, 'earth', 'sun') + 180,
      );
    };

    let found = NaN;
    let previousJd = jdFromCalendar(2020, 9, 15);
    let previous = offsetFromOpposition(previousJd);
    for (let jd = previousJd + 1; jd < jdFromCalendar(2020, 11, 15); jd += 1) {
      const current = offsetFromOpposition(jd);
      if (Math.sign(current) !== Math.sign(previous)) {
        found = previousJd + (jd - previousJd) * (previous / (previous - current));
        break;
      }
      previousJd = jd;
      previous = current;
    }

    const date = calendarFromJd(found);
    expect(date.month).toBe(10);
    expect(date.day).toBeGreaterThanOrEqual(11);
    expect(date.day).toBeLessThanOrEqual(15);
  }, 60_000);
});
