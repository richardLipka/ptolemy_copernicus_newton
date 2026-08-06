/**
 * The parameters are data now, so these check the two things that makes true.
 *
 * First, that nothing moved: the historical values are still the default, and
 * an engine asked for them without argument gives what it always gave. That is
 * the whole safety net for a change that touched every geometry function.
 *
 * Second, that the parameters actually *drive* the construction — that varying
 * one moves the prediction, that varying one body leaves the others alone, and
 * that a set can be fitted to observations and recovers something real. The last
 * of those is the point of the exercise, and it is checked against a quantity
 * Ptolemy did not believe in.
 */

import { describe, expect, it } from 'vitest';

import { BODIES, type BodyId } from '../bodies';
import { apparentLongitude } from '../coordinates';
import { jdFromCalendar } from '../time';
import {
  ALMAGEST_PARAMETERS,
  MODERN_MOTIONS,
  createPtolemaicEngine,
  ptolemaicEpicyclicPositions,
  ptolemaicGeometryFor,
  type PtolemaicParameters,
} from './ptolemaic';
import {
  COPERNICAN_PARAMETERS,
  copernicanPositions,
  createCopernicanEngine,
  type CopernicanParameters,
} from './copernican';
import {
  KEPLERIAN_PARAMETERS,
  createKeplerianEngine,
  keplerianPositions,
  type KeplerianParameters,
} from './keplerian';
import { vsop87Positions } from './vsop87';

const JD = jdFromCalendar(2026, 8, 6);

/** A deep-enough copy that a test can move one number without touching the shared default. */
const variantOf = (
  edit: (p: PtolemaicParameters) => void,
): PtolemaicParameters => {
  const copy: PtolemaicParameters = {
    planets: Object.fromEntries(
      Object.entries(ALMAGEST_PARAMETERS.planets).map(([id, m]) => [id, { ...m! }]),
    ),
    sun: { ...ALMAGEST_PARAMETERS.sun },
    moon: { ...ALMAGEST_PARAMETERS.moon },
  };
  edit(copy);
  return copy;
};

describe('the defaults are still Ptolemy', () => {
  it('gives the same positions with the parameters passed explicitly', () => {
    const implicit = ptolemaicEpicyclicPositions(JD);
    const explicit = ptolemaicEpicyclicPositions(JD, MODERN_MOTIONS, ALMAGEST_PARAMETERS);

    for (const [id, position] of implicit) {
      const other = explicit.get(id)!;
      expect(position.x, `${id}.x`).toBeCloseTo(other.x, 15);
      expect(position.y, `${id}.y`).toBeCloseTo(other.y, 15);
    }
  });

  it('still carries the Almagest values themselves', () => {
    // Spot-checked against Toomer: if someone edits the table, this says so.
    expect(ALMAGEST_PARAMETERS.planets.mars).toEqual({
      apogee: 115.5,
      eccentricity: 6.0,
      epicycleRadius: 39.5,
      kind: 'superior',
    });
    expect(ALMAGEST_PARAMETERS.sun).toEqual({ apogee: 65.5, eccentricity: 2.5 });
    expect(ALMAGEST_PARAMETERS.moon.epicycleRadius).toBe(5.25);
  });

  it('leaves Copernicus his 3/2 and 1/2', () => {
    expect(COPERNICAN_PARAMETERS.deferentShare).toBe(1.5);
    expect(COPERNICAN_PARAMETERS.epicycletShare).toBe(0.5);

    const implicit = copernicanPositions(JD);
    const explicit = copernicanPositions(JD, COPERNICAN_PARAMETERS);
    for (const [id, position] of implicit) {
      expect(position.x, `${id}.x`).toBeCloseTo(explicit.get(id)!.x, 15);
    }
  });
});

describe('the parameters drive the construction', () => {
  it('moves a planet when its epicycle changes', () => {
    const wider = variantOf((p) => {
      p.planets.mars!.epicycleRadius = 45;
    });
    const before = apparentLongitude(ptolemaicEpicyclicPositions(JD), 'earth', 'mars');
    const after = apparentLongitude(
      ptolemaicEpicyclicPositions(JD, MODERN_MOTIONS, wider),
      'earth',
      'mars',
    );
    expect(Math.abs(after - before)).toBeGreaterThan(1);
  });

  it('leaves the other planets where they were', () => {
    // Otherwise a fit of one body would silently perturb the rest, and fitting
    // them one at a time — which is how it is actually done — would not work.
    const wider = variantOf((p) => {
      p.planets.mars!.epicycleRadius = 45;
    });
    const before = ptolemaicEpicyclicPositions(JD);
    const after = ptolemaicEpicyclicPositions(JD, MODERN_MOTIONS, wider);

    for (const id of ['venus', 'mercury', 'sun', 'moon'] as BodyId[]) {
      expect(after.get(id)!.x, `${id}.x`).toBeCloseTo(before.get(id)!.x, 15);
      expect(after.get(id)!.y, `${id}.y`).toBeCloseTo(before.get(id)!.y, 15);
    }
  });

  it('rebuilds the nested spheres from the parameters it was given', () => {
    /*
     * The shells are chained out of the epicycle radii and eccentricities, so a
     * changed epicycle must change the deferent scale too. If this ever stopped
     * holding, a fitted set would be drawn against Ptolemy's own shell spacing —
     * the numbers would be the student's and the distances would not.
     */
    const wider = variantOf((p) => {
      p.planets.jupiter!.epicycleRadius = 20;
    });
    const before = ptolemaicGeometryFor(JD, 'saturn')!.deferentRadius;
    const after = ptolemaicGeometryFor(JD, 'saturn', MODERN_MOTIONS, wider)!.deferentRadius;

    // Saturn sits outside Jupiter, so a fatter Jovian shell pushes it out.
    expect(after).toBeGreaterThan(before);
  });

  it('drops a planet the parameters do not mention', () => {
    const without = variantOf((p) => {
      delete p.planets.saturn;
    });
    expect(ptolemaicEpicyclicPositions(JD, MODERN_MOTIONS, without).has('saturn')).toBe(false);
    expect(ptolemaicGeometryFor(JD, 'saturn', MODERN_MOTIONS, without)).toBeNull();
  });

  it('moves a Copernican planet when the epicyclet share changes', () => {
    const noEpicyclet: CopernicanParameters = { deferentShare: 1.5, epicycletShare: 0 };
    const before = copernicanPositions(JD).get('mars')!;
    const after = copernicanPositions(JD, noEpicyclet).get('mars')!;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(1e-4);
  });

  it('substitutes one Copernican orbit and leaves the rest standing', () => {
    const shrunk: CopernicanParameters = {
      ...COPERNICAN_PARAMETERS,
      orbits: {
        mars: {
          ...BODIES.mars.orbit!,
          epoch: { ...BODIES.mars.orbit!.epoch, a: BODIES.mars.orbit!.epoch.a * 0.9 },
        },
      },
    };
    const before = copernicanPositions(JD);
    const after = copernicanPositions(JD, shrunk);

    const marsMoved = Math.hypot(
      after.get('mars')!.x - before.get('mars')!.x,
      after.get('mars')!.y - before.get('mars')!.y,
    );
    expect(marsMoved).toBeGreaterThan(0.1);
    expect(after.get('venus')!.x).toBeCloseTo(before.get('venus')!.x, 15);
    expect(after.get('jupiter')!.x).toBeCloseTo(before.get('jupiter')!.x, 15);
  });
});

describe('an engine can be built from a parameter set', () => {
  it('produces a working Engine that honours its parameters', () => {
    const wider = variantOf((p) => {
      p.planets.mars!.epicycleRadius = 45;
    });
    const engine = createPtolemaicEngine(wider);

    expect(engine.id).toBe('ptolemaic-epicyclic');
    expect(engine.construction).toBeDefined();

    // Everything downstream takes an Engine and asks it questions, so this is
    // what lets a fitted set be fed to the track, the events and the harness.
    const fromEngine = engine.positionsAt(JD).get('mars')!;
    const direct = ptolemaicEpicyclicPositions(JD, MODERN_MOTIONS, wider).get('mars')!;
    expect(fromEngine.x).toBeCloseTo(direct.x, 15);

    expect(engine.construction!(JD, 'mars')).not.toBeNull();
  });

  it('takes a distinguishing id so two sets can be told apart', () => {
    const engine = createPtolemaicEngine(ALMAGEST_PARAMETERS, MODERN_MOTIONS, 'ptolemaic-almagest');
    expect(engine.id).toBe('ptolemaic-almagest');
  });

  it('builds a Copernican engine the same way', () => {
    const engine = createCopernicanEngine({ deferentShare: 1.5, epicycletShare: 0 });
    expect(engine.id).toBe('copernican');
    const mars = engine.positionsAt(JD).get('mars')!;
    expect(Number.isFinite(mars.x)).toBe(true);
  });

  it('builds a Keplerian engine from fitted elements', () => {
    /*
     * Kepler has no free device to fit — the ellipse is the whole construction —
     * so what a reconstruction solves for is the orbit itself. That is his own
     * method: the Mars triangulation, pairs of observations one Martian year
     * apart, from which the orbit falls out point by point.
     */
    const fitted: KeplerianParameters = {
      orbits: {
        mars: {
          ...BODIES.mars.orbit!,
          epoch: { ...BODIES.mars.orbit!.epoch, e: 0.12 },
        },
      },
    };
    const engine = createKeplerianEngine(fitted);
    expect(engine.id).toBe('keplerian');

    const before = keplerianPositions(JD).get('mars')!;
    const after = engine.positionsAt(JD).get('mars')!;
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(0.01);

    // And the rest of the system is untouched, as for the other two.
    expect(engine.positionsAt(JD).get('venus')!.x).toBeCloseTo(
      keplerianPositions(JD).get('venus')!.x,
      15,
    );
  });

  it('leaves the Keplerian defaults exactly as they were', () => {
    const implicit = keplerianPositions(JD);
    const explicit = keplerianPositions(JD, KEPLERIAN_PARAMETERS);
    for (const [id, position] of implicit) {
      expect(position.x, `${id}.x`).toBeCloseTo(explicit.get(id)!.x, 15);
      expect(position.y, `${id}.y`).toBeCloseTo(explicit.get(id)!.y, 15);
    }
  });
});

describe('fitting a parameter to observations recovers a real quantity', () => {
  /**
   * Root-mean-square geocentric longitude error, arcminutes, for a candidate
   * Martian epicycle radius measured against the reference ephemeris.
   */
  function residualFor(epicycleRadius: number): number {
    const params = variantOf((p) => {
      p.planets.mars!.epicycleRadius = epicycleRadius;
    });
    let sum = 0;
    const samples = 24;
    for (let i = 0; i < samples; i++) {
      const jd = JD + i * (780 / samples); // one synodic period, evenly walked
      const model = apparentLongitude(ptolemaicEpicyclicPositions(jd, MODERN_MOTIONS, params), 'earth', 'mars');
      const truth = apparentLongitude(vsop87Positions(jd), 'earth', 'mars');
      let d = model - truth;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      sum += d * d;
    }
    return Math.sqrt(sum / samples) * 60;
  }

  it('finds the epicycle that Ptolemy found, and it is Mars’s distance', () => {
    /*
     * This is the whole reason the parameters had to become data.
     *
     * Sweep the epicycle radius, keep the one that fits the observed longitudes
     * best, and the answer is not an arbitrary curve-fitting constant: for a
     * superior planet r/R = 1/a, where a is the heliocentric semi-major axis.
     * A student who fits this number has measured how far Mars is from the Sun,
     * in a model that denies the Sun is the centre of anything.
     */
    let best = 0;
    let bestResidual = Infinity;
    for (let r = 30; r <= 50; r += 0.1) {
      const residual = residualFor(r);
      if (residual < bestResidual) {
        bestResidual = residual;
        best = r;
      }
    }

    const impliedDistance = 60 / best;
    const trueDistance = BODIES.mars.orbit!.epoch.a;

    // The fit lands within a few percent of Mars's real distance — the
    // equivalence r/R = 1/a, arrived at from longitudes alone.
    expect(impliedDistance / trueDistance).toBeGreaterThan(0.95);
    expect(impliedDistance / trueDistance).toBeLessThan(1.05);

    // And Ptolemy's own 39.5 is close to what the sweep picks, which is the
    // other half of the lesson: he had this number, to about a percent.
    expect(Math.abs(best - 39.5) / 39.5).toBeLessThan(0.05);
  });

  it('is a real minimum, not a flat curve the search fell off the end of', () => {
    // A parameter that does not matter would give the same residual everywhere,
    // and the "fit" above would be meaningless.
    const atBest = residualFor(39.4);
    expect(residualFor(30)).toBeGreaterThan(atBest * 2);
    expect(residualFor(50)).toBeGreaterThan(atBest * 2);
  });
});
