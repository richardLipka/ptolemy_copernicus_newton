/**
 * What survives a model switch.
 *
 * This is the app's central promise: the models are comparable only if
 * switching between them changes the model and nothing else. It has been got
 * wrong in both directions during development — once by snapping the frame
 * origin to each mode's canonical centre, which moved two things at once — so
 * it is pinned down here.
 */

import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_JD, MIN_JD, jdFromCalendar } from '../core/time';
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
    expect(store.get().engineId).toBe('copernican');
    store.setMode('newton');
    expect(store.get().engineId).toBe('nbody');
  });

  it('drops a ghost that would duplicate the newly active engine', () => {
    // The engine the Copernican mode opens on — its faithful eccentric one.
    store.setGhostEngine('copernican');
    expect(store.get().ghostEngineId).toBe('copernican');

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

describe('running off the end of the supported range', () => {
  /**
   * The clock clamps at 1600 and 2400 regardless, so without an explicit pause
   * the app sat apparently frozen — nothing moving, no trail growing — while
   * the transport still read "Pause" and invited the user to stop something
   * that had already stopped.
   */
  it('stops playing rather than pinning silently at the end', () => {
    const store = new Store();
    store.setJulianDate(MAX_JD - 1);
    store.setRate(400);
    store.play();

    store.tick(1);

    expect(store.get().playing).toBe(false);
    expect(store.get().julianDate).toBe(MAX_JD);
  });

  it('does the same at the near end', () => {
    const store = new Store();
    store.setJulianDate(MIN_JD + 1);
    store.setRate(400);
    store.play();

    store.tick(-1);

    expect(store.get().playing).toBe(false);
  });

  it('keeps running well inside the range', () => {
    const store = new Store();
    store.setJulianDate(jdFromCalendar(2000, 1, 1));
    store.setRate(1);
    store.play();

    store.tick(1);

    expect(store.get().playing).toBe(true);
  });
});

describe('dragging the map', () => {
  it('accumulates offsets in map-radius units', () => {
    const store = new Store();
    store.panBy(0.25, -0.5);
    store.panBy(0.25, 0.1);

    expect(store.get().panX).toBeCloseTo(0.5, 9);
    expect(store.get().panY).toBeCloseTo(-0.4, 9);
  });

  /**
   * The point of the request: choosing a stationary point should actually
   * centre on it. Keeping an earlier drag would be the literal reading of "hold
   * that body still" and the wrong one — asking to look at Mars and finding it
   * off the edge of the screen is not what was meant.
   */
  it('recentres when a new stationary point is chosen', () => {
    const store = new Store();
    store.panBy(0.8, 0.3);
    store.setFrameOrigin('mars');

    expect(store.get().frameOrigin).toBe('mars');
    expect(store.get().panX).toBe(0);
    expect(store.get().panY).toBe(0);
  });

  it('leaves the drag alone when the observation point changes', () => {
    // The vantage is a different question from where the map is looking.
    const store = new Store();
    store.panBy(0.8, 0.3);
    store.setObservationPoint('mars');

    expect(store.get().panX).toBeCloseTo(0.8, 9);
  });

  /** Double-click is the way back from both a zoom and a drag. */
  it('is cleared along with the zoom', () => {
    const store = new Store();
    store.setZoom(6);
    store.panBy(1.5, -2);
    store.resetZoom();

    expect(store.get().zoom).toBe(1);
    expect(store.get().panX).toBe(0);
    expect(store.get().panY).toBe(0);
  });

  it('starts centred', () => {
    const store = new Store();
    expect(store.get().panX).toBe(0);
    expect(store.get().panY).toBe(0);
  });
});
