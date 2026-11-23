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
import type { EngineId, ModeId } from './engines/types.js';
import { jdFromCalendar } from './time.js';

/** Which half of the core thesis a trial illustrates. */
export type DemonstrationTheme = 'equivalence' | 'prediction';

export type EvidencePanelKind = 'sky' | 'track' | 'scorecard';

export interface Demonstration {
  id: string;
  /** Groups trials by the question they answer: same geometry vs unequal predictive reach. */
  theme: DemonstrationTheme;
  /** The instant to jump to. */
  jd: number;
  /** Selected so its panel and harness show the thing in question. */
  body: BodyId;
  /** Model to arrive in — usually the one that fails or reveals the contrast. */
  mode: ModeId;
  frameOrigin: BodyId;
  observationPoint: BodyId;
  /** Optional scene aids applied when entering this trial. */
  showRecentredHarness?: boolean;
  ghostEngineId?: EngineId | 'all' | null;
  openEvidence?: EvidencePanelKind | null;
  skyField?: number;
  /** Zoom onto the body and its satellite system on entry. */
  focusBody?: boolean;
}

/** Fraction of a day, for the verified clock times. */
const at = (hours: number, minutes = 0): number => (hours + minutes / 60) / 24;

export const DEMONSTRATIONS: readonly Demonstration[] = [
  /**
   * 19 February 2027, 15:44 UT. Mars at opposition, seen from Earth in Kepler's
   * model with Composition turned on and Ptolemy's ghost beside it.
   *
   * Shows that holding Earth still in a heliocentric model literally turns the
   * two orbits into a deferent carrying an epicycle — and lands within a couple
   * of degrees of Ptolemy's own construction. The disagreement was never about
   * geometry; it was about which body to hold still.
   */
  {
    id: 'mars-composition-2027',
    theme: 'equivalence',
    jd: jdFromCalendar(2027, 2, 19) + at(15, 44),
    body: 'mars',
    mode: 'kepler',
    frameOrigin: 'earth',
    observationPoint: 'earth',
    showRecentredHarness: true,
    ghostEngineId: 'ptolemaic-epicyclic',
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
    theme: 'equivalence',
    jd: jdFromCalendar(1602, 3, 3) + at(4, 31),
    body: 'mars',
    mode: 'copernicus',
    frameOrigin: 'sun',
    observationPoint: 'earth',
    ghostEngineId: 'all',
    openEvidence: 'track',
  },

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
    theme: 'prediction',
    jd: jdFromCalendar(1610, 10, 15),
    body: 'venus',
    mode: 'ptolemy',
    frameOrigin: 'earth',
    observationPoint: 'earth',
    ghostEngineId: 'keplerian',
    openEvidence: 'sky',
  },

  /**
   * 7 January 1610, 20:00 UT. Galileo turns his telescope on Jupiter in Padua
   * and sees moons circling something other than the Earth.
   *
   * Shown inside Ptolemy's model on purpose: four bodies plainly orbiting
   * Jupiter — obeying Kepler's third law with Jupiter's own mass constant —
   * broke the claim that the heavens have a single centre.
   */
  {
    id: 'galilean-moons-1610',
    theme: 'prediction',
    jd: jdFromCalendar(1610, 1, 7) + at(20, 0),
    body: 'jupiter',
    mode: 'ptolemy',
    frameOrigin: 'earth',
    observationPoint: 'earth',
    focusBody: true,
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
    theme: 'prediction',
    jd: jdFromCalendar(1631, 11, 7) + at(7, 18),
    body: 'mercury',
    mode: 'kepler',
    frameOrigin: 'sun',
    observationPoint: 'earth',
    ghostEngineId: 'all',
    openEvidence: 'sky',
    skyField: 4,
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
    theme: 'prediction',
    jd: jdFromCalendar(1603, 12, 18) + at(6, 47),
    body: 'jupiter',
    mode: 'ptolemy',
    frameOrigin: 'earth',
    observationPoint: 'earth',
    ghostEngineId: 'all',
    openEvidence: 'sky',
    skyField: 12,
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
    theme: 'prediction',
    jd: jdFromCalendar(2020, 12, 21) + at(18, 22),
    body: 'saturn',
    mode: 'kepler',
    frameOrigin: 'sun',
    observationPoint: 'earth',
    ghostEngineId: 'all',
    openEvidence: 'sky',
    skyField: 4,
  },

  /**
   * 15 June 2026. The Moon: where Kepler's fixed ellipse stops working and
   * Newton's universal gravity takes over.
   *
   * In Kepler mode the Moon's osculating ellipse visibly breathes across a
   * factor of three in eccentricity. Switch to Newton and the forces explain
   * why: the Sun pulls the Moon nearly twice as hard as Earth does (~65% vs
   * ~35%), yet the Moon orbits Earth because both fall toward the Sun together.
   */
  {
    id: 'lunar-perturbation-2026',
    theme: 'prediction',
    jd: jdFromCalendar(2026, 6, 15),
    body: 'moon',
    mode: 'kepler',
    frameOrigin: 'earth',
    observationPoint: 'earth',
    focusBody: true,
  },
];
