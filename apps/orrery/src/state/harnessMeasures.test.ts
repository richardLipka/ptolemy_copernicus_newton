/**
 * What the harness notes assert, held to the geometry that produced them.
 *
 * These are the figures a reader is shown when they point at a circle, and they
 * are exactly the kind that rot: a change to the nested spheres, to the mean
 * motions or to the projection would move them silently while every picture on
 * screen still looked right. Ptolemy's own parameters are pinned tightly —
 * 39;30 is a number in the Almagest, not an approximation — and everything
 * derived is pinned as a bound.
 */

import { describe, expect, it } from 'vitest';

import { BODIES } from '@orrery/core/bodies';
import { jdFromCalendar } from '@orrery/core/time';
import { measureHarnessPart, type HarnessRole } from './harnessMeasures';
import type { State } from './store';

const JD = jdFromCalendar(2026, 3, 15);

const STATE: State = {
  mode: 'ptolemy',
  engineId: 'ptolemaic-epicyclic',
  ghostEngineId: null,
  frameOrigin: 'earth',
  observationPoint: 'earth',
  selectedBody: 'mars',
  zodiacScheme: 'signs',
  sphereCentre: 'frame',
  scaleMode: 'compressed',
  zoom: 1,
  panX: 0,
  panY: 0,
  showOrbits: true,
  showSightLines: true,
  showStarFigures: true,
  showConstruction: true,
  showTrack: false,
  locale: 'en',
  theme: 'orrery',
  showCalculation: false,
  showWelcome: false,
  showNotes: true,
  julianDate: JD,
  playing: false,
  rateDaysPerSecond: 1,
} as State;

const stateFor = (engineId: State['engineId']): State => ({ ...STATE, engineId });

const valueOf = (
  state: State,
  bodyId: Parameters<typeof measureHarnessPart>[1],
  role: HarnessRole,
  key: string,
  target: Parameters<typeof measureHarnessPart>[3] = {},
): number => {
  const part = measureHarnessPart(state, bodyId, role, target);
  const measure = part?.measures.find((candidate) => candidate.key === key);
  if (!measure) throw new Error(`no ${key} on ${role} of ${bodyId}`);
  return measure.value;
};

describe('Ptolemy is quoted in his own units', () => {
  const state = stateFor('ptolemaic-epicyclic');

  it('makes every deferent 60 parts, because that is what a part is', () => {
    for (const body of ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'sun'] as const) {
      expect(valueOf(state, body, 'deferent', 'radius')).toBeCloseTo(60, 9);
    }
  });

  it('gives the Almagest eccentricities and epicycles unchanged', () => {
    // Toomer's figures. The deferent radii here come from the nested spheres and
    // are anything but round, so these landing on Ptolemy's own numbers is the
    // test that the scaling has not leaked into the parameters.
    const almagest: Record<string, { eccentricity: number; epicycle: number }> = {
      mercury: { eccentricity: 3.0, epicycle: 22.5 },
      venus: { eccentricity: 1.25, epicycle: 43.17 },
      mars: { eccentricity: 6.0, epicycle: 39.5 },
      jupiter: { eccentricity: 2.75, epicycle: 11.5 },
      saturn: { eccentricity: 3.4167, epicycle: 6.5 },
    };

    for (const [body, expected] of Object.entries(almagest)) {
      const id = body as 'mars';
      expect(valueOf(state, id, 'centre', 'offset')).toBeCloseTo(expected.eccentricity, 6);
      expect(valueOf(state, id, 'epicycle', 'radius')).toBeCloseTo(expected.epicycle, 6);
      // The equant is the bisection: as far again beyond the centre.
      expect(valueOf(state, id, 'equant', 'offset')).toBeCloseTo(
        2 * expected.eccentricity,
        6,
      );
    }
  });

  it('reads the epicycle ratio as the distance from the Sun it implies', () => {
    /*
     * The claim the note makes, and the reason the whole thing is worth
     * building: r/R is 1/a for a superior planet and a itself for an inferior
     * one. Ptolemy had all five distances and no way to see it.
     */
    for (const body of ['mercury', 'venus', 'mars', 'jupiter', 'saturn'] as const) {
      const implied = valueOf(state, body, 'epicycle', 'impliedDistance');
      const truth = BODIES[body].orbit!.epoch.a;
      expect(valueOf(state, body, 'epicycle', 'trueDistance')).toBeCloseTo(truth, 6);
      // Within four percent for all five, and within a percent for four of them
      // — Mercury is the outlier, as it is everywhere else in this app.
      expect(Math.abs(implied - truth) / truth).toBeLessThan(0.04);
    }

    expect(valueOf(state, 'mars', 'epicycle', 'impliedDistance')).toBeCloseTo(1.519, 3);
    expect(valueOf(state, 'venus', 'epicycle', 'impliedDistance')).toBeCloseTo(0.7195, 4);
  });

  it('shows the equant doing the one thing it exists to do', () => {
    // Uniform about the equant, not about the Earth. The two figures differing
    // *is* the note's claim, and they differ by a fifth here.
    const uniform = valueOf(state, 'mars', 'equant', 'uniformRate');
    const apparent = valueOf(state, 'mars', 'equant', 'apparentRate');

    // Mars's mean sidereal motion, 360/686.98.
    expect(uniform).toBeCloseTo(0.524, 3);
    expect(Math.abs(apparent - uniform)).toBeGreaterThan(0.05);

    // And the arm keeps the equant's rate rather than the Earth's, which is
    // what makes drawing it from the equant rather than the centre honest.
    expect(valueOf(state, 'mars', 'deferent-arm', 'rate')).toBeCloseTo(uniform, 6);
  });

  it('withholds a period from a model that fixes no distances', () => {
    const part = measureHarnessPart(state, 'mars', 'deferent');
    expect(part?.measures.some((measure) => measure.key === 'period')).toBe(false);
  });

  it('keeps a moon in kilometres, since parts of a deferent would say nothing', () => {
    const part = measureHarnessPart(state, 'io', 'deferent');
    expect(part?.measures[0]?.unit).toBe('km');
    expect(valueOf(state, 'io', 'deferent', 'radius')).toBeCloseTo(421_800, 0);
  });
});

describe('the heliocentric models are measured in their own terms', () => {
  it('gives Kepler the orbit, both foci and the second law', () => {
    const state = stateFor('keplerian');
    const truth = BODIES.mars.orbit!.epoch;

    expect(valueOf(state, 'mars', 'orbit', 'semiMajor')).toBeCloseTo(truth.a, 4);
    expect(valueOf(state, 'mars', 'orbit', 'eccentricity')).toBeCloseTo(truth.e, 3);
    expect(valueOf(state, 'mars', 'orbit', 'period')).toBeCloseTo(686.98, 1);

    // Nearly a circle, which is why the offset Sun is what the eye can see.
    expect(valueOf(state, 'mars', 'orbit', 'axisRatio')).toBeGreaterThan(0.99);

    // The empty focus stands 2ae from the occupied one.
    expect(valueOf(state, 'mars', 'focus', 'focusSeparation')).toBeCloseTo(
      2 * truth.a * truth.e,
      3,
    );

    // Faster than the mean near perihelion: the second law, as a number.
    const rate = valueOf(state, 'mars', 'radius', 'rate');
    const mean = valueOf(state, 'mars', 'radius', 'meanRate');
    const distance = valueOf(state, 'mars', 'radius', 'length');
    expect(distance < truth.a).toBe(rate > mean);
  });

  it('tells the occupied focus from the empty one', () => {
    const state = stateFor('keplerian');
    const construction = [0, 1].map(
      (markerIndex) => measureHarnessPart(state, 'mars', 'focus', { markerIndex })?.variant,
    );
    expect(new Set(construction)).toEqual(new Set(['occupied', 'empty']));
  });

  it("recovers Copernicus's eccentricity from the way he split it", () => {
    // He puts 3/2·ae in the centre's offset and 1/2·ae in the epicyclet, so the
    // orbit's own e is recoverable from the drawing without asking his
    // parameters what it was.
    const state = stateFor('copernican');
    expect(valueOf(state, 'mars', 'centre', 'eccentricity')).toBeCloseTo(
      BODIES.mars.orbit!.epoch.e,
      3,
    );
    expect(valueOf(state, 'mars', 'deferent', 'radius')).toBeCloseTo(
      BODIES.mars.orbit!.epoch.a,
      4,
    );
  });

  it('gives Newton the forces the info panel gives', () => {
    const state = stateFor('nbody');
    const share = valueOf(state, 'mars', 'gravity', 'share', { source: 'sun' });
    expect(share).toBeGreaterThan(0.999);
    expect(valueOf(state, 'mars', 'velocity', 'speed')).toBeGreaterThan(20);
    expect(valueOf(state, 'mars', 'gravity', 'separation', { source: 'sun' })).toBeGreaterThan(1);
  });
});

describe('rates are sampled fast enough for what they measure', () => {
  /*
   * Io goes round Jupiter in forty-two hours. Sampled a day apart its 203
   * degrees a day aliases to −157: the sign inverted, which would have the
   * note claiming a retrograde moon. See `rateStepDays`.
   */
  it('does not alias a moon that laps the sampling interval', () => {
    for (const engineId of ['keplerian', 'copernican', 'circular'] as const) {
      const state = stateFor(engineId);
      const role: HarnessRole = engineId === 'keplerian' ? 'radius' : 'deferent-arm';
      const rate = valueOf(state, 'io', role, 'rate');
      const mean = 360 / BODIES.io.satellite!.periodDays;
      // Direct, and within a couple of percent of the mean rate. Not exact:
      // this is the longitude rate at one instant on a tilted, slightly
      // eccentric orbit, taken over a finite step.
      expect(rate).toBeGreaterThan(0);
      expect(Math.abs(rate - mean) / mean).toBeLessThan(0.02);
    }
  });
});
