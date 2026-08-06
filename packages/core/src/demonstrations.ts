/**
 * The moments the models were put on trial.
 *
 * An argument about which system is better is settled by an observation that
 * they disagree about, and there are only a handful in the whole history that
 * did real work. Each of these sets the app to a date, a body and a vantage
 * where the disagreement is not subtle — where one model says a thing the sky
 * plainly did not do.
 *
 * **Every date here was found with the app's own solver rather than copied from
 * memory**, and the tests in `demonstrations.test.ts` re-derive them. That
 * matters more than usual: a teaching tool that quietly cites a wrong date is
 * worse than one that cites none, and the 1631 transit in particular is only
 * remarkable if the geometry really does put Mercury across the Sun's disc.
 */

import type { BodyId } from './bodies.js';
import type { ModeId } from './engines/types.js';
import { jdFromCalendar } from './time.js';

export interface Demonstration {
  id: string;
  /** The instant to jump to. */
  jd: number;
  /** Selected so its panel and harness show the thing in question. */
  body: BodyId;
  /** Model to arrive in — usually the one that fails. */
  mode: ModeId;
  frameOrigin: BodyId;
  observationPoint: BodyId;
}

/** Fraction of a day, for the verified clock times. */
const at = (hours: number, minutes = 0): number => (hours + minutes / 60) / 24;

export const DEMONSTRATIONS: readonly Demonstration[] = [
  /**
   * Autumn 1610. Galileo finds Venus gibbous — three-quarters lit — and
   * announces it that December in an anagram to Kepler.
   *
   * Measured here: Kepler 75% lit, Ptolemy 39%. Ptolemy is not merely wrong, he
   * is *forbidden*: with the deferents scaled to his nested spheres Venus is
   * penned between Earth and the Sun and can never pass half-lit at all. This
   * is the observation that killed the geocentric system, and the app shows it
   * as a flat contradiction rather than a discrepancy.
   */
  {
    id: 'venus-phases-1610',
    jd: jdFromCalendar(1610, 10, 15),
    body: 'venus',
    mode: 'ptolemy',
    frameOrigin: 'earth',
    observationPoint: 'earth',
  },

  /**
   * 7 November 1631, 07:18 UT. Mercury crosses the face of the Sun.
   *
   * Kepler predicted it in the *Rudolphine Tables* and did not live to see it;
   * Gassendi watched it in Paris. Verified here: geocentric latitude 0.002°,
   * comfortably inside the Sun's 0.27° disc, so the transit is real in this
   * app's geometry and not merely asserted. A prediction of this kind is the
   * sharpest possible test — the event either happens or it does not.
   */
  {
    id: 'mercury-transit-1631',
    jd: jdFromCalendar(1631, 11, 7) + at(7, 18),
    body: 'mercury',
    mode: 'kepler',
    frameOrigin: 'sun',
    observationPoint: 'earth',
  },

  /**
   * 18 December 1603. Jupiter and Saturn meet.
   *
   * The great conjunction Kepler observed, and near whose place the 1604 nova
   * appeared the following autumn. It is also the event that most punishes a
   * model: the two planets close at a few hundredths of a degree a day, so a
   * small angular error becomes an enormous error in time.
   */
  {
    id: 'great-conjunction-1603',
    jd: jdFromCalendar(1603, 12, 18) + at(6, 47),
    body: 'jupiter',
    mode: 'ptolemy',
    frameOrigin: 'earth',
    observationPoint: 'earth',
  },

  /**
   * Mars at opposition, 3 March 1602 — Tycho's programme, Kepler's assignment.
   *
   * Mars has the largest eccentricity of the classical superior planets, so it
   * is where a circular orbit fails worst and where Kepler's eight arcminutes of
   * residual refused to go away. Selecting Mars here and switching between
   * Copernicus and Kepler is the app's central comparison at the exact place in
   * the sky that forced it.
   */
  {
    id: 'mars-opposition-1602',
    jd: jdFromCalendar(1602, 3, 3) + at(4, 31),
    body: 'mars',
    mode: 'copernicus',
    frameOrigin: 'sun',
    observationPoint: 'earth',
  },

  /**
   * 21 December 2020. Jupiter and Saturn again, within living memory.
   *
   * The same crushing test as 1603, with a published time to check against: the
   * reference lands within eight minutes, Kepler's ellipses within hours, and
   * the geocentric construction days away.
   */
  {
    id: 'great-conjunction-2020',
    jd: jdFromCalendar(2020, 12, 21) + at(18, 22),
    body: 'saturn',
    mode: 'kepler',
    frameOrigin: 'sun',
    observationPoint: 'earth',
  },
];
