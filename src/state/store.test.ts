/**
 * What survives a model switch.
 *
 * This is the app's central promise: the three models are comparable only if
 * switching between them changes the model and nothing else. It has been got
 * wrong in both directions during development — once by snapping the frame
 * origin to each mode's canonical centre, which moved two things at once — so
 * it is pinned down here.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { jdFromCalendar } from '../core/time';
import { Store } from './store';

let store: Store;

beforeEach(() => {
  store = new Store();
});

describe('switching model', () => {
  it('leaves the stationary point alone', () => {
    store.setFrameOrigin('mars');

    store.setMode('ptolemy');
    expect(store.get().frameOrigin).toBe('mars');
    store.setMode('copernicus');
    expect(store.get().frameOrigin).toBe('mars');
    store.setMode('newton');
    expect(store.get().frameOrigin).toBe('mars');
  });

  it('leaves the observation point alone', () => {
    store.setObservationPoint('jupiter');

    for (const mode of ['ptolemy', 'copernicus', 'newton'] as const) {
      store.setMode(mode);
      expect(store.get().observationPoint, mode).toBe('jupiter');
    }
  });

  it('keeps the date, so the comparison is of the same instant', () => {
    const jd = jdFromCalendar(1687, 7, 5);
    store.setJulianDate(jd);

    store.setMode('ptolemy');
    expect(store.get().julianDate).toBeCloseTo(jd, 9);
    store.setMode('copernicus');
    expect(store.get().julianDate).toBeCloseTo(jd, 9);
  });

  it('keeps the selection, scale, zodiac scheme and overlay switches', () => {
    store.selectBody('saturn');
    store.setScaleMode('true');
    store.setZodiacScheme('constellations');
    store.toggle('showSightLines');
    store.toggle('showStarFigures');

    store.setMode('ptolemy');

    const state = store.get();
    expect(state.selectedBody).toBe('saturn');
    expect(state.scaleMode).toBe('true');
    expect(state.zodiacScheme).toBe('constellations');
    expect(state.showSightLines).toBe(false);
    expect(state.showStarFigures).toBe(false);
  });

  it('changes the engine, which is the only thing it should change', () => {
    store.setMode('ptolemy');
    expect(store.get().engineId).toBe('ptolemaic-epicyclic');
    store.setMode('copernicus');
    expect(store.get().engineId).toBe('circular');
    store.setMode('newton');
    expect(store.get().engineId).toBe('nbody');
  });

  it('drops a ghost that would duplicate the newly active engine', () => {
    store.setGhostEngine('circular');
    expect(store.get().ghostEngineId).toBe('circular');

    // Comparing a model against itself shows nothing.
    store.setMode('copernicus');
    expect(store.get().ghostEngineId).toBeNull();
  });

  it('keeps an unrelated ghost across the switch', () => {
    store.setGhostEngine('ptolemaic-epicyclic');
    store.setMode('copernicus');
    expect(store.get().ghostEngineId).toBe('ptolemaic-epicyclic');
  });

  it('clears the trail, because history belongs to one model', () => {
    store.play();
    store.tick(2);
    expect(store.trails.size).toBeGreaterThan(0);

    store.setMode('copernicus');
    expect(store.trails.size).toBe(0);
  });
});

describe('opening state', () => {
  it('starts from the opening mode’s canonical centre and vantage', () => {
    const state = store.get();
    expect(state.mode).toBe('newton');
    expect(state.frameOrigin).toBe('sun');
    expect(state.observationPoint).toBe('earth');
  });
});

describe('the frame picker is free in every model', () => {
  it('accepts any body, including non-canonical choices', () => {
    for (const mode of ['ptolemy', 'copernicus', 'newton'] as const) {
      store.setMode(mode);
      // Ptolemy centred on the Sun is a legitimate view, and the maths does not
      // care; §4.4 makes the picker free in all modes deliberately.
      store.setFrameOrigin('sun');
      expect(store.get().frameOrigin, mode).toBe('sun');
      store.setFrameOrigin('earth');
      expect(store.get().frameOrigin, mode).toBe('earth');
    }
  });
});
