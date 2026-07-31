/**
 * How well the reference ephemeris knows an event's *time*.
 *
 * The event panel prints a clock time beside each model's prediction, so it is
 * worth being precise about what that time is worth. The solver bisects to under
 * a second, which means the precision on show is entirely the ephemeris's.
 *
 * The error is not uniform across events, and the reason governs everything
 * here: an event is found where an angle crosses zero, so a fixed angular error
 * becomes a time error *divided by the rate at which the angle closes*. Mars
 * comes to opposition briskly. Jupiter and Saturn converge at a few hundredths
 * of a degree a day, which multiplies any angular error by roughly thirty.
 *
 * That is why the reference had to be VSOP87 rather than approximate Keplerian
 * elements. The tests below hold both: the reference is minutes from published
 * times, and the engine it replaced was hours.
 */

import { describe, expect, it } from 'vitest';

import { keplerianPositions } from './engines/keplerian';
import { nbodyEngine } from './engines/nbody';
import type { PositionSet } from './engines/types';
import { vsop87Positions } from './engines/vsop87';
import { findConjunctions, findOppositions } from './events';
import { jdFromCalendar } from './time';

type Ephemeris = (jd: number) => PositionSet;

const nbody: Ephemeris = (jd) => nbodyEngine.positionsAt(jd);

/** Published time of the great conjunction, 21 December 2020 18:22 UT. */
const GREAT_CONJUNCTION_2020 = jdFromCalendar(2020, 12, 21) + (18 + 22 / 60) / 24;
/** Published time of the Mars opposition, 13 October 2020 23:26 UT. */
const MARS_OPPOSITION_2020 = jdFromCalendar(2020, 10, 13) + (23 + 26 / 60) / 24;

const greatConjunction = (positionsAt: Ephemeris): number =>
  findConjunctions(positionsAt, 'jupiter', 'saturn', {
    observer: 'earth',
    startJd: jdFromCalendar(2020, 11, 1),
    endJd: jdFromCalendar(2021, 2, 1),
    stepDays: 1,
  })[0]!.jd;

const marsOpposition = (positionsAt: Ephemeris): number =>
  findOppositions(positionsAt, 'mars', {
    observer: 'earth',
    startJd: jdFromCalendar(2020, 9, 1),
    endJd: jdFromCalendar(2020, 12, 1),
    stepDays: 1,
  })[0]!.jd;

const minutes = (days: number) => Math.abs(days) * 24 * 60;

describe('the reference ephemeris is good to minutes', () => {
  /**
   * Measured: 8 minutes early. The slowest event this app finds, and the one
   * that decides whether a clock time can honestly be printed at all.
   */
  it('times the 2020 great conjunction to within a quarter of an hour', () => {
    expect(minutes(greatConjunction(vsop87Positions) - GREAT_CONJUNCTION_2020))
      .toBeLessThan(15);
  });

  /** Measured: 7 minutes early. */
  it('times the 2020 Mars opposition to within a quarter of an hour', () => {
    expect(minutes(marsOpposition(vsop87Positions) - MARS_OPPOSITION_2020))
      .toBeLessThan(15);
  });
});

describe('why the approximate elements were not enough', () => {
  /**
   * The engine VSOP87 replaced as reference. Kept as a test rather than deleted
   * because it records *why* the change was worth making, and because that
   * engine is still in use — it seeds the n-body integration and underpins the
   * Ptolemaic reframe, where degrees rather than minutes are what matter.
   */
  it('was eleven hours out on the great conjunction', () => {
    const error = minutes(greatConjunction(keplerianPositions) - GREAT_CONJUNCTION_2020);
    expect(error).toBeGreaterThan(120);
  });

  it('and VSOP87 beats it by more than an order of magnitude there', () => {
    const better = minutes(greatConjunction(vsop87Positions) - GREAT_CONJUNCTION_2020);
    const worse = minutes(greatConjunction(keplerianPositions) - GREAT_CONJUNCTION_2020);
    expect(worse / better).toBeGreaterThan(10);
  });
});

describe('the n-body integration is a model, not a reference', () => {
  /**
   * It is out by a day and a half on the great conjunction — worse than the
   * approximate elements — because a slowly closing angle magnifies the
   * integrator's own drift just as it magnifies everything else. This is why the
   * comparison table lists it as one of the models being judged rather than as
   * the thing judging them.
   */
  it('is hours out where the reference is minutes', () => {
    expect(minutes(greatConjunction(nbody) - GREAT_CONJUNCTION_2020)).toBeGreaterThan(60);
  });

  it('but still lands the right day on a fast event', () => {
    expect(minutes(marsOpposition(nbody) - MARS_OPPOSITION_2020)).toBeLessThan(180);
  });
});
