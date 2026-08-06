/**
 * The moons, and the two things they are here to demonstrate.
 *
 * The app makes no claim about their precision — the mean longitudes are
 * approximate and the configuration on a given date is not to be trusted. What
 * it *does* claim rests entirely on the periods, and those are asserted here.
 */

import { describe, expect, it } from 'vitest';

import {
  BODIES,
  BODY_IDS,
  GRAVITATING_BODY_IDS,
  SATELLITE_IDS,
  type BodyId,
} from './bodies.js';
import { circularPositions } from './engines/circular.js';
import { copernicanPositions } from './engines/copernican.js';
import { keplerianPositions } from './engines/keplerian.js';
import { nbodyEngine } from './engines/nbody.js';
import { ptolemaicEpicyclicPositions } from './engines/ptolemaic.js';
import { vsop87Positions } from './engines/vsop87.js';
import { satelliteOffsetAt } from './satellites.js';
import { jdFromCalendar } from './time.js';
import { length, sub } from './vec.js';

const GALILEANS: readonly BodyId[] = ['io', 'europa', 'ganymede', 'callisto'];
const JD = jdFromCalendar(1610, 1, 7); // The night Galileo first saw them.

describe('Kepler’s third law holds inside the Jovian system', () => {
  /**
   * The same law, a different centre, and a constant of its own — which is the
   * whole reason these bodies are worth drawing. `a³/P²` across the four
   * Galileans:
   *
   *   io        2.397e16
   *   europa    2.396e16
   *   ganymede  2.396e16
   *   callisto  2.396e16
   *
   * Constant to four significant figures, in km³/day². If someone mistypes a
   * semi-major axis or a period, this is the test that notices.
   */
  it('gives every Galilean the same a³/P², to four figures', () => {
    const ratios = GALILEANS.map((id) => {
      const orbit = BODIES[id].satellite!;
      return orbit.a ** 3 / orbit.periodDays ** 2;
    });

    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    for (const [index, ratio] of ratios.entries()) {
      expect(Math.abs(ratio - mean) / mean, GALILEANS[index]).toBeLessThan(5e-4);
    }
  });

  /**
   * And a *different* constant from the solar system's, because the constant is
   * set by the mass at the centre. Jupiter is about a thousandth of the Sun, so
   * its constant should be smaller by roughly that factor.
   */
  it('uses a different constant from the Sun’s', () => {
    const io = BODIES.io.satellite!;
    const jovian = io.a ** 3 / (io.periodDays / 365.25) ** 2;

    // Earth: a = 1 AU, P = 1 yr, so the solar constant is 1 in these units.
    expect(jovian).toBeLessThan(0.01);
    expect(jovian).toBeGreaterThan(0.0001);
  });
});

describe('the Laplace resonance', () => {
  /**
   * Io, Europa and Ganymede are locked 1:2:4 — the thing that makes the Jovian
   * system worth watching rather than merely looking at. Run the clock and they
   * keep returning to the same configuration.
   */
  it('locks Io, Europa and Ganymede into periods of 1 : 2 : 4', () => {
    const io = BODIES.io.satellite!.periodDays;
    const europa = BODIES.europa.satellite!.periodDays;
    const ganymede = BODIES.ganymede.satellite!.periodDays;

    expect(europa / io).toBeCloseTo(2, 1);
    expect(ganymede / io).toBeCloseTo(4, 1);
    expect(ganymede / europa).toBeCloseTo(2, 1);
  });

  /**
   * The resonance proper is a relation between the *mean motions*, and it is
   * this combination that vanishes: n_Io − 3·n_Europa + 2·n_Ganymede ≈ 0.
   * A coincidence of ratios would not satisfy it to this precision.
   */
  it('satisfies the resonance relation between the mean motions', () => {
    const n = (id: BodyId): number => 360 / BODIES[id].satellite!.periodDays;
    const residual = n('io') - 3 * n('europa') + 2 * n('ganymede');

    // Against Io's own mean motion of about 203°/day.
    expect(Math.abs(residual) / n('io')).toBeLessThan(0.002);
  });
});

describe('the moons ride their primary in every model', () => {
  const engines: [string, (jd: number) => ReturnType<typeof keplerianPositions>][] = [
    ['ptolemy', ptolemaicEpicyclicPositions],
    ['copernicus', copernicanPositions],
    ['concentric', circularPositions],
    ['kepler', keplerianPositions],
    ['reference', vsop87Positions],
    ['newton', (jd) => nbodyEngine.positionsAt(jd) as ReturnType<typeof keplerianPositions>],
  ];

  /**
   * No pre-1610 model contains these bodies at all, so they are placed the same
   * way everywhere and it is the *primary* that moves when the model changes.
   * What must hold in every model is that each moon stays within its own orbit
   * of the planet it belongs to.
   */
  for (const [name, positionsAt] of engines) {
    it(`keeps every moon beside its planet under ${name}`, () => {
      const positions = positionsAt(JD);

      for (const id of SATELLITE_IDS) {
        const parent = BODIES[id].parent!;
        const separation = length(sub(positions.get(id)!, positions.get(parent)!));
        const orbit = BODIES[id].satellite!;

        // Between pericentre and apocentre, with room for rounding.
        expect(separation, `${name}/${id}`).toBeGreaterThan(orbit.a * (1 - orbit.e) * 0.99);
        expect(separation, `${name}/${id}`).toBeLessThan(orbit.a * (1 + orbit.e) * 1.01);
      }
    });
  }

  it('puts all four Galileans around Jupiter and Titan around Saturn', () => {
    for (const id of GALILEANS) expect(BODIES[id].parent, id).toBe('jupiter');
    expect(BODIES.titan.parent).toBe('saturn');
  });
});

describe('the moons stay out of the integrator', () => {
  /**
   * The integrator's quarter-day step gives Io seven steps per orbit, which does
   * not close. Including them would need a step fifteen times smaller and turn a
   * 370 ms seek into something near fifteen seconds — so they are two-body
   * riders instead, which is Newton's own treatment of them anyway.
   */
  it('leaves the gravitating set at the nine major bodies', () => {
    expect(GRAVITATING_BODY_IDS).toHaveLength(BODY_IDS.length - SATELLITE_IDS.length);
    for (const id of SATELLITE_IDS) {
      expect(GRAVITATING_BODY_IDS).not.toContain(id);
    }
  });

  it('would not be resolved by the integrator’s step, which is why', () => {
    const stepDays = 0.25;
    expect(BODIES.io.satellite!.periodDays / stepDays).toBeLessThan(10);
  });
});

describe('the orbits themselves', () => {
  it('advances each moon through a full revolution in its own period', () => {
    for (const id of SATELLITE_IDS) {
      const orbit = BODIES[id].satellite!;
      const start = satelliteOffsetAt(JD, id)!;
      const afterOne = satelliteOffsetAt(JD + orbit.periodDays, id)!;

      // Back where it started, to a small fraction of the orbit.
      expect(length(sub(afterOne, start)) / orbit.a, id).toBeLessThan(0.02);
    }
  });

  it('puts Titan well out of the ecliptic, where Saturn’s tilt places it', () => {
    // Saturn's equator is inclined some 27°, and its largest moon goes with it.
    let highest = 0;
    for (let day = 0; day < 16; day += 0.25) {
      highest = Math.max(highest, Math.abs(satelliteOffsetAt(JD + day, 'titan')!.z));
    }
    const orbit = BODIES.titan.satellite!;
    expect(highest / orbit.a).toBeGreaterThan(0.3);
  });

  it('keeps the Galileans nearly in the ecliptic by comparison', () => {
    let highest = 0;
    for (let day = 0; day < 17; day += 0.25) {
      for (const id of GALILEANS) {
        highest = Math.max(highest, Math.abs(satelliteOffsetAt(JD + day, id)!.z));
      }
    }
    expect(highest / BODIES.callisto.satellite!.a).toBeLessThan(0.1);
  });

  it('returns nothing for a body that is not a satellite', () => {
    expect(satelliteOffsetAt(JD, 'mars')).toBeNull();
    expect(satelliteOffsetAt(JD, 'sun')).toBeNull();
  });
});
