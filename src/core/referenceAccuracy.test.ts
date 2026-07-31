/**
 * How well the reference ephemeris actually knows an event's *time*.
 *
 * The event panel prints a clock time beside each model's prediction, so it is
 * worth being precise about what that time is worth. The solver bisects to under
 * a second, which means the precision on show is entirely the ephemeris's, and
 * the ephemeris here is JPL's *approximate* Keplerian elements.
 *
 * The error is not uniform across events, and the reason is worth understanding:
 * an event is found where an angle crosses zero, so a fixed angular error turns
 * into a time error divided by the rate at which the angle closes. Mars comes to
 * opposition briskly and its time is good to an hour or so. Jupiter and Saturn
 * converge at a few hundredths of a degree a day, and there the same angular
 * error becomes half a day.
 */

import { describe, expect, it } from 'vitest';

import { keplerianPositions } from './engines/keplerian';
import { nbodyEngine } from './engines/nbody';
import { findConjunctions, findOppositions } from './events';
import { jdFromCalendar } from './time';

import type { PositionSet } from './engines/types';

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

const hours = (days: number) => Math.abs(days) * 24;

describe('a fast event is timed well', () => {
  it('puts the 2020 Mars opposition within a couple of hours', () => {
    // Measured: 1.5 hours early. Earth overtakes Mars at about half a degree a
    // day, so the angular error barely registers as a time.
    expect(hours(marsOpposition(keplerianPositions) - MARS_OPPOSITION_2020))
      .toBeLessThan(3);
  });

  it('and the n-body integration agrees with it', () => {
    expect(hours(marsOpposition(nbody) - marsOpposition(keplerianPositions)))
      .toBeLessThan(1);
  });
});

describe('a slow event is not', () => {
  /**
   * Measured: the reference lands 11 hours late, the n-body integration a day
   * and a half early, and the two sit two days apart — on an event they agree
   * about to a fraction of a degree.
   *
   * This is the number that decides whether a clock time can be printed
   * honestly, and it is why the panel carries a note saying so.
   */
  it('misses the 2020 great conjunction by hours, not minutes', () => {
    const error = hours(greatConjunction(keplerianPositions) - GREAT_CONJUNCTION_2020);
    expect(error).toBeGreaterThan(2);
    expect(error).toBeLessThan(30);
  });

  it('and the two modern engines disagree with each other by more still', () => {
    const gap = hours(greatConjunction(nbody) - greatConjunction(keplerianPositions));
    expect(gap).toBeGreaterThan(6);
  });

  it('though both agree on the day to within two', () => {
    // The date remains sound even where the hour does not, which is the case
    // for showing a date plainly and a time with a caveat.
    expect(Math.abs(greatConjunction(keplerianPositions) - GREAT_CONJUNCTION_2020))
      .toBeLessThan(2);
    expect(Math.abs(greatConjunction(nbody) - GREAT_CONJUNCTION_2020)).toBeLessThan(2);
  });
});
