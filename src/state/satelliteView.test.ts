/**
 * How the moons are drawn, as distinct from where they are.
 *
 * Three rules, all of them about keeping a system of four legible rather than
 * about accuracy: a moon's marker, its trail and its orbit circle must share one
 * exaggeration or they drift apart on screen; selecting any member of a family
 * draws the whole family; and the map must survive every model and both scales.
 */

import { describe, expect, it } from 'vitest';

import { BODIES } from '../core/bodies';
import { keplerianPositions } from '../core/engines/keplerian';
import { ptolemaicEpicyclicPositions } from '../core/engines/ptolemaic';
import { jdFromCalendar } from '../core/time';
import {
  buildConstruction,
  projectPositions,
  projectRadius,
  projectTrail,
} from './selectors';
import { Store, type ScaleMode } from './store';
import { TrailLog } from './trails';
import type { EngineId } from '../core/engines/types';

const JD = jdFromCalendar(1610, 1, 7);

const stateFor = (engineId: EngineId, scaleMode: ScaleMode, selected: 'jupiter' | 'io') => {
  const store = new Store();
  store.setJulianDate(JD);
  store.setEngine(engineId);
  store.setFrameOrigin('jupiter');
  store.setScaleMode(scaleMode);
  store.selectBody(selected);
  return store.get();
};

const distance = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

const ENGINES: EngineId[] = [
  'ptolemaic-epicyclic',
  'circular',
  'copernican',
  'keplerian',
  'nbody',
];
const SCALES: ScaleMode[] = ['compressed', 'true'];

describe('a moon is drawn beside its planet in every model and scale', () => {
  for (const engineId of ENGINES) {
    for (const scaleMode of SCALES) {
      it(`${engineId} at ${scaleMode} scale`, () => {
        stateFor(engineId, scaleMode, 'jupiter');

        const projected = projectPositions(
          // The engine's own positions, whichever engine that is.
          (engineId === 'ptolemaic-epicyclic'
            ? ptolemaicEpicyclicPositions
            : keplerianPositions)(JD),
          'jupiter',
          scaleMode,
        );

        const jupiter = projected.get('jupiter')!;
        const spacings = (['io', 'europa', 'ganymede', 'callisto'] as const).map((id) =>
          distance(projected.get(id)!, jupiter),
        );

        // Ordered outward, and none of them collapsed onto the planet.
        for (let i = 1; i < spacings.length; i++) {
          expect(spacings[i]!, `${engineId}/${scaleMode}`).toBeGreaterThan(spacings[i - 1]!);
        }

        if (scaleMode === 'compressed') {
          // Exaggerated enough to be a visible system rather than a smudge.
          expect(spacings[0]!).toBeGreaterThan(0.005);
        } else {
          /*
           * True scale is the honest view and gets no exaggeration at all — the
           * same rule Earth's Moon follows. Io really does sit 0.000161 of the
           * map radius from Jupiter, and drawing it four hundred times further
           * out would be exactly the lie the toggle exists to switch off. The
           * deep zoom is what makes the system separable again.
           */
          expect(spacings[0]!).toBeCloseTo(
            projectRadius(BODIES.io.satellite!.a, 'true'),
            4,
          );
          expect(spacings[0]!).toBeLessThan(0.0005);
        }

        // Linear either way, so the drawn spread is always the real one.
        expect(spacings[3]! / spacings[0]!).toBeCloseTo(
          BODIES.callisto.satellite!.a / BODIES.io.satellite!.a,
          1,
        );
      });
    }
  }
});

describe('marker, orbit and trail share one exaggeration', () => {
  /**
   * The three are computed in different places, and if any one of them used a
   * different scaling the moon would sit off its own drawn orbit. This is the
   * test that would catch that.
   */
  it('puts the orbit circle through the marker', () => {
    for (const scaleMode of SCALES) {
      const state = stateFor('keplerian', scaleMode, 'io');
      const construction = buildConstruction(state, 'io')!;
      const projected = projectPositions(keplerianPositions(JD), 'jupiter', scaleMode);

      const io = projected.get('io')!;
      const jupiter = projected.get('jupiter')!;
      const drawnRadius = distance(io, jupiter);

      // Every sampled point of the circle sits at the marker's own radius.
      for (const point of construction.curves[0]!.points) {
        expect(distance(point, jupiter), scaleMode).toBeCloseTo(drawnRadius, 3);
      }
    }
  });

  it('lays the trail along the same circle', () => {
    const log = new TrailLog(400, 0.2);
    for (let d = 0; d <= 20; d += 0.2) log.record(JD + d, keplerianPositions(JD + d));

    const trail = projectTrail(log.all(), 'io', 'jupiter', 'compressed');
    const projected = projectPositions(keplerianPositions(JD), 'jupiter', 'compressed');
    const jupiter = projected.get('jupiter')!;
    const drawnRadius = distance(projected.get('io')!, jupiter);

    expect(trail.length).toBeGreaterThan(50);
    for (const point of trail) {
      // Io's orbit is nearly circular, so the trail keeps a near-constant radius.
      expect(distance(point, jupiter) / drawnRadius).toBeCloseTo(1, 1);
    }
  });
});

describe('selecting one member draws the whole family', () => {
  /**
   * A single circle says nothing about a system whose entire interest is the
   * relation between its members — the 1:2:4 spacing is only visible with all
   * four present. So the renderer asks for each sibling in turn, and each must
   * yield geometry whichever member is selected.
   */
  it('yields a construction for every Galilean, in every model', () => {
    for (const engineId of ENGINES) {
      for (const selected of ['jupiter', 'io'] as const) {
        const state = stateFor(engineId, 'compressed', selected);
        for (const id of ['io', 'europa', 'ganymede', 'callisto'] as const) {
          const construction = buildConstruction(state, id);
          expect(construction, `${engineId}/${selected}/${id}`).not.toBeNull();
          expect(construction!.curves.length).toBeGreaterThan(0);
          expect(construction!.arms.length).toBeGreaterThan(0);
        }
      }
    }
  });

  /**
   * Newton's engine exposes no `construction` at all — it places bodies by force
   * — so a satellite's orbit has to come from the satellite itself rather than
   * from the engine, or the moons would be bare dots in that one mode.
   */
  it('draws moon orbits even where the engine has no construction of its own', () => {
    const state = stateFor('nbody', 'compressed', 'jupiter');
    expect(buildConstruction(state, 'jupiter')).toBeNull();
    expect(buildConstruction(state, 'io')).not.toBeNull();
  });
});
