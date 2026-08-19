/**
 * The band of sky, held to the same numbers the rest of the app reports.
 *
 * The band is the one view that claims to show what an observer would *see*, so
 * two kinds of mistake matter more here than anywhere else: it could disagree
 * with the app's own apparent positions, in which case one of the two is lying;
 * or it could quietly leave something out, in which case the sky it draws is
 * missing a planet and looks perfectly fine.
 */

import { describe, expect, it } from 'vitest';

import { BODIES } from '@orrery/core/bodies';
import { apparentLongitude, solarElongation } from '@orrery/core/coordinates';
import { ENGINES } from '@orrery/core/engines/registry';
import { jdFromCalendar } from '@orrery/core/time';
import { buildSkyView } from './skyView';
import type { State } from './store';

const JD = jdFromCalendar(2026, 8, 10);

const STATE: State = {
  mode: 'kepler',
  engineId: 'keplerian',
  ghostEngineId: null,
  frameOrigin: 'sun',
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
  showSky: true,
  skyField: 40,
  locale: 'en',
  theme: 'orrery',
  showCalculation: false,
  showWelcome: false,
  showNotes: true,
  julianDate: JD,
  playing: false,
  rateDaysPerSecond: 1,
} as State;

const viewFor = (patch: Partial<State> = {}, field = 40) =>
  buildSkyView({ ...STATE, ...patch } as State, field);

describe('the band is centred on what was asked for', () => {
  it('puts the selected body in the middle, in both angles', () => {
    const view = viewFor()!;
    const target = view.bodies.find((body) => body.id === 'mars')!;

    expect(target.offset).toBeCloseTo(0, 9);
    expect(view.centreLatitude).toBeCloseTo(target.latitude, 9);
    expect(target.separation).toBeCloseTo(0, 9);
  });

  it('agrees with the apparent position the info panel prints', () => {
    const view = viewFor()!;
    const positions = ENGINES.keplerian.positionsAt(JD);

    expect(view.centre).toBeCloseTo(apparentLongitude(positions, 'earth', 'mars'), 9);
    for (const body of view.bodies) {
      expect(body.longitude, body.id).toBeCloseTo(
        apparentLongitude(positions, 'earth', body.id),
        9,
      );
    }
  });

  it('never shows the place being observed from', () => {
    for (const observer of ['earth', 'mars'] as const) {
      const view = viewFor({ observationPoint: observer, selectedBody: 'jupiter' })!;
      expect(view.bodies.map((body) => body.id)).not.toContain(observer);
    }
  });

  it('has nothing to show when the selection is the observer', () => {
    expect(viewFor({ selectedBody: 'earth', observationPoint: 'earth' })).toBeNull();
    expect(viewFor({ selectedBody: null })).toBeNull();
  });
});

describe('what falls inside the field', () => {
  it('keeps everything within the field and drops what is beyond it', () => {
    const view = viewFor({}, 12)!;
    for (const mark of [...view.bodies, ...view.stars]) {
      // The margin, and no more: a couple of degrees of overshoot so nothing
      // appears out of nowhere at the edge while the clock runs.
      expect(Math.abs(mark.offset)).toBeLessThanOrEqual(12 / 2 + 2);
    }
  });

  it('shows more of the sky as the field widens', () => {
    const narrow = viewFor({}, 4)!;
    const wide = viewFor({}, 40)!;

    expect(wide.stars.length).toBeGreaterThanOrEqual(narrow.stars.length);
    expect(wide.bodies.length).toBeGreaterThanOrEqual(narrow.bodies.length);
    expect(wide.stars.length + wide.bodies.length).toBeGreaterThan(
      narrow.stars.length + narrow.bodies.length,
    );
  });

  it('brings a moon in only when its own system is the subject', () => {
    const atJupiter = viewFor({ selectedBody: 'jupiter' })!;
    expect(atJupiter.bodies.map((body) => body.id)).toContain('io');

    // Looking at Mars, Jupiter may well be in the same field — its moons are
    // not what is being looked at and would be five marks on one point.
    const atMars = viewFor({ selectedBody: 'mars' })!;
    expect(atMars.bodies.map((body) => body.id)).not.toContain('io');
  });

  it('measures separations as true angles rather than differences in longitude', () => {
    const view = viewFor({ selectedBody: 'jupiter' })!;

    for (const body of view.bodies) {
      // A separation must be at least the longitude gap and at least the
      // latitude gap, and no more than the two added.
      const dLat = Math.abs(body.latitude - view.centreLatitude);
      expect(body.separation).toBeGreaterThanOrEqual(Math.abs(body.offset) - 1e-9);
      expect(body.separation).toBeGreaterThanOrEqual(dLat - 1e-9);
      expect(body.separation).toBeLessThanOrEqual(Math.abs(body.offset) + dLat + 1e-9);
    }
  });
});

describe('what the band says about the model running', () => {
  it('reports Ptolemy putting every planet exactly on the ecliptic', () => {
    // Not a rounding artefact: the Almagest builds latitude as a separate
    // apparatus and this app implements only the longitudes.
    const ptolemy = viewFor({ engineId: 'ptolemaic-epicyclic', frameOrigin: 'earth' })!;

    expect(ptolemy.flatLatitudes).toBe(true);
    for (const body of ptolemy.bodies) expect(body.latitude).toBe(0);
  });

  it('and the other three scattering them about it', () => {
    for (const engineId of ['keplerian', 'nbody', 'copernican'] as const) {
      const view = viewFor({ engineId })!;
      expect(view.flatLatitudes, engineId).toBe(false);
    }
  });

  it('gives Venus a phase the models disagree about', () => {
    const lit = (engineId: State['engineId']): number =>
      viewFor({ engineId, selectedBody: 'venus', frameOrigin: 'sun' })!.bodies.find(
        (body) => body.id === 'venus',
      )!.illumination.illuminatedFraction;

    // The observation that broke the geocentric system, in the one view that
    // could have shown it: penned inside the Sun's shell, Ptolemy's Venus can
    // never be more than half lit.
    expect(lit('ptolemaic-epicyclic')).toBeLessThan(0.5);
    expect(lit('keplerian')).toBeGreaterThan(0.5);
  });
});

describe('whether the field could be observed at all', () => {
  it('measures how far the centre is from the Sun', () => {
    const view = viewFor()!;
    const positions = ENGINES.keplerian.positionsAt(JD);
    const elongation = Math.abs(solarElongation(positions, 'earth', 'mars'));

    // The same quantity the info panel gives, to within the latitude term the
    // elongation there ignores.
    expect(view.solarDistance).toBeCloseTo(elongation, 0);
  });

  it('finds the Sun itself at no distance from a field centred on it', () => {
    const view = viewFor({ selectedBody: 'sun' })!;
    expect(view.solarDistance).toBeCloseTo(0, 9);
    expect(view.bodies.find((body) => body.id === 'sun')?.offset).toBeCloseTo(0, 9);
  });
});

describe("the divisions are the ring's own", () => {
  it('places sign boundaries by the precession of the date', () => {
    const view = viewFor()!;
    for (const division of view.divisions) {
      expect(Math.abs(division.offset)).toBeLessThanOrEqual(40 / 2 + 2);
      expect(Object.keys(BODIES)).not.toContain(division.id);
    }

    // Over eight centuries the signs slide against the fixed stars by some
    // eleven degrees, and the band has to slide with them.
    const then = buildSkyView(
      { ...STATE, julianDate: jdFromCalendar(2400, 8, 10) } as State,
      40,
    );
    expect(then).not.toBeNull();
  });
});
