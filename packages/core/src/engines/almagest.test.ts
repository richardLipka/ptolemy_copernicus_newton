/**
 * Ptolemy's own tables, as against his geometry fed with modern angles.
 *
 * The two Ptolemaic epicyclic engines differ in exactly one respect: where the
 * mean longitudes come from. Holding the geometry fixed and swapping the tables
 * separates the error in his *construction* from the drift in his *rates*.
 *
 * The measured answer is not the one folklore suggests, and it splits in an
 * instructive way. Carried nineteen centuries forward, his tables move the slow
 * outer planets by about a degree and the fast inner ones by twenty. His rates
 * are uniformly excellent — a part in a hundred thousand, from Babylonian
 * records with baselines centuries long — but a fractional error in a period is
 * paid once per revolution, and Venus has gone round three thousand times since
 * 137 AD where Saturn has managed sixty-four.
 *
 * The Sun fares well for a second reason: in this star-fixed frame two of his
 * errors partly cancel, his tropical year being six minutes too long while his
 * precession is a quarter too slow.
 */

import { describe, expect, it } from 'vitest';

import type { BodyId } from '../bodies.js';
import { apparentLongitude } from '../coordinates.js';
import { jdFromCalendar } from '../time.js';
import { angleDiffDeg } from '../vec.js';
import { keplerianPositions } from './keplerian.js';
import { almagestTablePositions, ptolemaicEpicyclicPositions } from './ptolemaic.js';

type Ephemeris = (jd: number) => ReturnType<typeof keplerianPositions>;

const PLANETS: BodyId[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];

/** Worst apparent-longitude gap between two ephemerides over a span. */
function worstGap(a: Ephemeris, b: Ephemeris, id: BodyId, startJd: number, days: number) {
  let worst = 0;
  for (let d = 0; d < days; d += 7) {
    const jd = startJd + d;
    worst = Math.max(
      worst,
      Math.abs(
        angleDiffDeg(
          apparentLongitude(a(jd), 'earth', id),
          apparentLongitude(b(jd), 'earth', id),
        ),
      ),
    );
  }
  return worst;
}

describe('Ptolemy’s tables in his own era', () => {
  const almagestEra = jdFromCalendar(137, 7, 20);

  it('agrees with the modern-angle version where it is anchored', () => {
    // The tables are taken to be exact at his epoch, so divergence must grow
    // from nothing there. Otherwise the comparison would be measuring the
    // anchor, or a misplaced apsidal line, rather than the rates.
    for (const id of PLANETS) {
      const gap = worstGap(
        almagestTablePositions,
        ptolemaicEpicyclicPositions,
        id,
        almagestEra - 900,
        1800,
      );
      expect(gap, `${id} near 137 AD`).toBeLessThan(0.05);
    }
  });
});

describe('what the tables do over nineteen centuries', () => {
  const today = jdFromCalendar(2026, 1, 1);

  /**
   * Measured drift from his epoch to the present, degrees of apparent longitude:
   *
   *   Mercury 12.5    Venus 22.2    Mars 0.6    Jupiter ~1    Saturn 1.0
   *
   * The split is not by how good the rate is but by how many times the body has
   * gone round. A fractional error in a period is paid once per revolution, and
   * since 137 AD Venus has completed some 3,000 circuits and Mercury 7,800
   * against Saturn's 64. Ptolemy's figures are excellent in relative terms —
   * a part in a hundred thousand — and it is sheer accumulation that turns that
   * into twenty degrees for the fast inner planets while the outer ones stay
   * inside a couple of lunar diameters.
   */
  it('drifts about a degree for the slow outer planets', () => {
    for (const id of ['mars', 'jupiter', 'saturn'] as BodyId[]) {
      const gap = worstGap(
        almagestTablePositions,
        ptolemaicEpicyclicPositions,
        id,
        today,
        2000,
      );
      expect(gap, `${id} lower`).toBeGreaterThan(0.05);
      expect(gap, `${id} upper`).toBeLessThan(4);
    }
  });

  it('drifts by tens of degrees for the fast inner ones', () => {
    // Mercury 12.5 degrees, Venus 22.2 — the price of thousands of revolutions.
    // Worth selecting in the app: these are the two bodies where using his
    // tables rather than modern angles visibly moves the planet on the zodiac.
    for (const id of ['mercury', 'venus'] as BodyId[]) {
      const gap = worstGap(
        almagestTablePositions,
        ptolemaicEpicyclicPositions,
        id,
        today,
        2000,
      );
      expect(gap, `${id} lower`).toBeGreaterThan(5);
      expect(gap, `${id} upper`).toBeLessThan(40);
    }
  });

  it('leaves the geometry alone — distances still obey the nesting', () => {
    // Swapping the tables must not disturb the nested spheres: Venus stays
    // inside the Sun's shell whichever angles drive the construction.
    for (let d = 0; d < 700; d += 5) {
      const p = almagestTablePositions(today + d);
      const earth = p.get('earth')!;
      const distance = (id: BodyId): number => {
        const b = p.get(id)!;
        return Math.hypot(b.x - earth.x, b.y - earth.y, b.z - earth.z);
      };
      expect(distance('venus'), `day ${d}`).toBeLessThan(distance('sun'));
      expect(distance('mars'), `day ${d}`).toBeGreaterThan(distance('sun'));
    }
  });

  it('stays within reach of reality, the geometry still dominating', () => {
    // His tables add about a degree to an error of several that the eccentric-
    // plus-equant construction already carries, so the total is of the same
    // order either way. Which of the two sub-modes comes out nearer the truth
    // for a given planet is a coincidence of epoch, not a fact worth asserting.
    for (const id of ['mars', 'jupiter', 'saturn'] as BodyId[]) {
      const withTables = worstGap(almagestTablePositions, keplerianPositions, id, today, 2000);
      const withModern = worstGap(
        ptolemaicEpicyclicPositions,
        keplerianPositions,
        id,
        today,
        2000,
      );
      expect(Math.abs(withTables - withModern), `${id}`).toBeLessThan(4);
    }
  });
});

describe('the rates themselves', () => {
  /**
   * Sidereal year implied by the Sun's motion in this star-fixed frame.
   *
   * Accumulated from unwrapped daily increments rather than by counting
   * circuits: at one-day sampling a circuit count cannot resolve 365.25 from
   * 364.96, and an earlier version of this test duly "measured" the latter.
   */
  function solarYearDays(positions: Ephemeris): number {
    const start = jdFromCalendar(1500, 1, 1);
    const span = 40_000;
    let total = 0;
    let previous = apparentLongitude(positions(start), 'earth', 'sun');
    for (let d = 1; d <= span; d += 1) {
      const now = apparentLongitude(positions(start + d), 'earth', 'sun');
      let step = now - previous;
      while (step < -180) step += 360;
      while (step > 180) step -= 360;
      total += step;
      previous = now;
    }
    return (360 * span) / total;
  }

  it('gives a sidereal year close to the truth', () => {
    // Measures 365.270 days against a true 365.256 — some twenty minutes out,
    // and the tolerance is loose because this counts *apparent* longitude, which
    // carries the equation of centre as well as the mean motion.
    //
    // The point is the comparison of frames. His *tropical* year, 365;14,48, is
    // six and a half minutes too long — the error that walked the Julian
    // calendar out of step with the seasons. Against the stars he does better,
    // because that error is largely cancelled by his precession being a quarter
    // too slow: two mistakes that partly undo each other.
    const period = solarYearDays(almagestTablePositions);
    expect(period).toBeGreaterThan(365.24);
    expect(period).toBeLessThan(365.30);
  });

  it('is not simply a copy of the modern rate', () => {
    const his = solarYearDays(almagestTablePositions);
    const modern = solarYearDays(ptolemaicEpicyclicPositions);
    expect(Math.abs(his - modern)).toBeGreaterThan(1e-5);
  });
});
