/**
 * The demonstrations claim historical facts, so the facts get checked.
 *
 * A teaching tool that cites a wrong date is worse than one that cites none, and
 * these dates are exactly the sort a reader will take on trust. Each is
 * re-derived here from the reference ephemeris rather than compared against a
 * constant, so the assertion is about the sky rather than about my typing.
 */

import { describe, expect, it } from 'vitest';

import { relativePosition, solarElongation } from './coordinates';
import { DEMONSTRATIONS, type Demonstration } from './demonstrations';
import { keplerianPositions } from './engines/keplerian';
import { ptolemaicEpicyclicPositions } from './engines/ptolemaic';
import { vsop87Positions } from './engines/vsop87';
import { findConjunctions, findOppositions } from './events';
import { illuminationOf } from './illumination';
import { MAX_JD, MIN_JD, jdFromCalendar } from './time';

const find = (id: string): Demonstration =>
  DEMONSTRATIONS.find((demonstration) => demonstration.id === id)!;

/** Hours between two Julian Dates. */
const hoursApart = (a: number, b: number): number => Math.abs(a - b) * 24;

describe('every demonstration is usable', () => {
  it('sits inside the supported range', () => {
    for (const demonstration of DEMONSTRATIONS) {
      expect(demonstration.jd, demonstration.id).toBeGreaterThanOrEqual(MIN_JD);
      expect(demonstration.jd, demonstration.id).toBeLessThanOrEqual(MAX_JD);
    }
  });

  it('has a distinct id', () => {
    const ids = DEMONSTRATIONS.map((demonstration) => demonstration.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never observes from the body it is asking you to look at', () => {
    for (const demonstration of DEMONSTRATIONS) {
      expect(demonstration.body, demonstration.id).not.toBe(demonstration.observationPoint);
    }
  });
});

describe('Galileo and the phases of Venus, 1610', () => {
  const demonstration = find('venus-phases-1610');

  /**
   * The contradiction, not merely a discrepancy. Ptolemy's nested spheres pen
   * Venus between Earth and the Sun, so it can never pass half-lit; the
   * heliocentric models put it beyond the Sun and three-quarters lit.
   */
  it('has Venus gibbous for Kepler and a crescent for Ptolemy', () => {
    const lit = (positions: ReturnType<typeof keplerianPositions>): number =>
      illuminationOf(positions, 'earth', 'venus').illuminatedFraction;

    const kepler = lit(keplerianPositions(demonstration.jd));
    const ptolemy = lit(ptolemaicEpicyclicPositions(demonstration.jd));

    expect(kepler).toBeGreaterThan(0.6);
    expect(ptolemy).toBeLessThan(0.5);
  });

  it('puts Venus far enough from the Sun to have been observable', () => {
    const elongation = Math.abs(
      solarElongation(vsop87Positions(demonstration.jd), 'earth', 'venus'),
    );
    expect(elongation).toBeGreaterThan(30);
  });
});

describe('the Mercury transit of 1631', () => {
  const demonstration = find('mercury-transit-1631');

  /**
   * The claim is that Mercury crossed the Sun's disc, and that is geometry
   * rather than rhetoric: it needs Mercury in conjunction with the Sun *and*
   * within the Sun's apparent radius of about 0.27° in latitude. Both are
   * checked, because a conjunction alone happens three times a year and is not
   * a transit.
   */
  it('really is a conjunction', () => {
    const [conjunction] = findConjunctions(vsop87Positions, 'mercury', 'sun', {
      observer: 'earth',
      startJd: demonstration.jd - 3,
      endJd: demonstration.jd + 3,
      stepDays: 0.25,
    });

    expect(conjunction).toBeDefined();
    expect(hoursApart(conjunction!.jd, demonstration.jd)).toBeLessThan(2);
  });

  it('really is a transit — Mercury inside the solar disc', () => {
    const latitude = relativePosition(
      vsop87Positions(demonstration.jd),
      'earth',
      'mercury',
    ).latitude;
    // The Sun's apparent radius is about 0.27°; measured here, 0.002°.
    expect(Math.abs(latitude)).toBeLessThan(0.27);
  });

  it('is not a transit at the neighbouring conjunctions, so the date matters', () => {
    const others = findConjunctions(vsop87Positions, 'mercury', 'sun', {
      observer: 'earth',
      startJd: jdFromCalendar(1631, 1, 1),
      endJd: jdFromCalendar(1631, 10, 1),
      stepDays: 1,
    });

    expect(others.length).toBeGreaterThan(2);
    for (const conjunction of others) {
      const latitude = relativePosition(
        vsop87Positions(conjunction.jd),
        'earth',
        'mercury',
      ).latitude;
      expect(Math.abs(latitude)).toBeGreaterThan(0.27);
    }
  });
});

describe('the great conjunctions', () => {
  for (const [id, body] of [
    ['great-conjunction-1603', 'jupiter'],
    ['great-conjunction-2020', 'saturn'],
  ] as const) {
    it(`${id} lands on a real Jupiter–Saturn conjunction`, () => {
      const demonstration = find(id);
      const [conjunction] = findConjunctions(vsop87Positions, 'jupiter', 'saturn', {
        observer: 'earth',
        startJd: demonstration.jd - 20,
        endJd: demonstration.jd + 20,
        stepDays: 0.5,
      });

      expect(conjunction).toBeDefined();
      expect(hoursApart(conjunction!.jd, demonstration.jd)).toBeLessThan(2);
      expect(demonstration.body).toBe(body);
    });
  }
});

describe('the Mars opposition of 1602', () => {
  const demonstration = find('mars-opposition-1602');

  it('lands on a real opposition', () => {
    const [opposition] = findOppositions(vsop87Positions, 'mars', {
      observer: 'earth',
      startJd: demonstration.jd - 20,
      endJd: demonstration.jd + 20,
      stepDays: 0.5,
    });

    expect(opposition).toBeDefined();
    expect(hoursApart(opposition!.jd, demonstration.jd)).toBeLessThan(2);
  });
});
