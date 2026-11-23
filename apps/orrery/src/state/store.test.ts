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

import { DEMONSTRATIONS } from '@orrery/core/demonstrations';
import { MAX_JD, MIN_JD, jdFromCalendar } from '@orrery/core/time';
import { EVENT_COMPARISON_ENGINES } from '../render/event-panel/eventPanel';
import { PHASE_COMPARISON_ENGINES } from '../render/info-panel/infoPanel';
import { availableGhostEngines } from '../ui/topBar';
import { COMPARISON_ENGINES, projectRadius } from './selectors';
import {
  DEFAULT_SKY_FIELD,
  MAX_SKY_FIELD,
  MAX_ZOOM,
  MAX_ZOOM_TRUE_SCALE,
  MIN_SKY_FIELD,
  MIN_ZOOM,
  Store,
} from './store';

/** The Moon's mean distance, in AU. Mirrors the figure in selectors.ts. */
const MOON_MEAN_DISTANCE_AU = 0.00257;

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
  it('starts from the opening mode’s canonical centre and vantage with Venus selected', () => {
    const state = store.get();
    expect(state.mode).toBe('newton');
    expect(state.frameOrigin).toBe('sun');
    expect(state.observationPoint).toBe('earth');
    expect(state.selectedBody).toBe('venus');
  });
});

describe('demonstrations and cross-model comparison', () => {
  it('closes the calculation overlay when a demonstration is applied', () => {
    store.setCalculationOpen(true);
    expect(store.get().showCalculation).toBe(true);

    const demo = DEMONSTRATIONS[0]!;
    store.applyDemonstration(demo);

    expect(store.get().showCalculation).toBe(false);
    expect(store.get().selectedBody).toBe(demo.body);
    expect(store.get().mode).toBe(demo.mode);
    expect(store.get().playing).toBe(false);
  });

  it('offers rival models across all modes in the single-ghost picker', () => {
    for (const active of ['nbody', 'keplerian', 'copernican', 'ptolemaic-epicyclic'] as const) {
      const choices = availableGhostEngines(active);
      expect(choices, active).not.toContain(active);
      for (const expected of ['ptolemaic-epicyclic', 'copernican', 'keplerian', 'nbody'] as const) {
        if (expected === active) continue;
        expect(choices, `${active} should offer ${expected}`).toContain(expected);
      }
    }
  });

  it('uses Copernicus’s actual eccentric model (not bare circles) in every comparison surface', () => {
    for (const list of [COMPARISON_ENGINES, PHASE_COMPARISON_ENGINES, EVENT_COMPARISON_ENGINES]) {
      expect(list).toContain('copernican');
      expect(list).not.toContain('circular');
      expect(list).toContain('ptolemaic-epicyclic');
      expect(list).toContain('keplerian');
      expect(list).toContain('nbody');
    }
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

/**
 * The zoom ceiling depends on the scale, because what there is to look at does.
 *
 * Compressed, the lunar orbit is exaggerated to 0.03 of the map radius and
 * twenty times is ample. At true scale it is 0.000147, so twenty times leaves it
 * under a pixel and the Moon sits welded to the Earth — which is precisely the
 * thing a true-scale view is for showing.
 */
describe('zoom limits', () => {
  it('stops at twenty times on the compressed scale', () => {
    const store = new Store();
    store.setScaleMode('compressed');
    store.setZoom(5000);

    expect(store.get().zoom).toBe(MAX_ZOOM);
  });

  it('allows a thousand times at true scale, enough to split the lunar orbit', () => {
    const store = new Store();
    store.setScaleMode('true');
    store.setZoom(5000);

    expect(store.get().zoom).toBe(MAX_ZOOM_TRUE_SCALE);

    /*
     * The point of the ceiling: put the Moon's real distance through the real
     * projection and the orbit has to come out to something a reader can see.
     * Asked of the projection rather than restated here, so that changing the
     * scale of the map moves this test with it.
     */
    const drawnRadii = projectRadius(MOON_MEAN_DISTANCE_AU, 'true');
    const halfFieldPx = 300;
    expect(drawnRadii * halfFieldPx * store.get().zoom).toBeGreaterThan(20);
    // and the old ceiling really was too low to show it — under two pixels.
    expect(drawnRadii * halfFieldPx * MAX_ZOOM).toBeLessThan(2);
  });

  it('pulls the zoom back down when leaving true scale', () => {
    /*
     * Otherwise a reader who zooms deep at true scale and flicks to compressed
     * lands at fifty times the compressed ceiling, staring at empty parchment
     * with no indication of what happened.
     */
    const store = new Store();
    store.setScaleMode('true');
    store.setZoom(800);
    store.setScaleMode('compressed');

    expect(store.get().zoom).toBe(MAX_ZOOM);
  });

  it('leaves a modest zoom alone when the scale changes', () => {
    const store = new Store();
    store.setScaleMode('true');
    store.setZoom(4);
    store.setScaleMode('compressed');

    expect(store.get().zoom).toBe(4);
  });

  it('holds the floor on both scales', () => {
    const store = new Store();
    for (const mode of ['compressed', 'true'] as const) {
      store.setScaleMode(mode);
      store.setZoom(0.001);
      expect(store.get().zoom).toBe(MIN_ZOOM);
    }
  });
});

/**
 * The band of sky has a zoom of its own, and the point of it is that it is not
 * the map's.
 *
 * They are quantities about different things — one magnifies a plan of the
 * solar system, the other decides how much sky is in view — and there is no
 * magnification of the plan that corresponds to forty degrees of ecliptic. The
 * app-wide wheel handler included the band by default until it was told not to,
 * so this is the kind of coupling that comes back if nothing watches for it.
 */
describe('the band of sky zooms on its own', () => {
  it('leaves the map alone when the band zooms', () => {
    store.setZoom(3);
    const zoom = store.get().zoom;

    store.zoomSkyBy(0.5);
    store.zoomSkyBy(0.5);

    expect(store.get().skyField).toBeCloseTo(DEFAULT_SKY_FIELD / 4, 9);
    expect(store.get().zoom).toBe(zoom);
  });

  it('leaves the band alone when the map zooms', () => {
    store.setSkyField(6);

    store.zoomBy(4);
    store.resetZoom();

    expect(store.get().skyField).toBe(6);
  });

  it('holds the field between what is worth looking at and what is still sky', () => {
    store.setSkyField(MIN_SKY_FIELD / 10);
    expect(store.get().skyField).toBe(MIN_SKY_FIELD);

    store.setSkyField(MAX_SKY_FIELD * 10);
    expect(store.get().skyField).toBe(MAX_SKY_FIELD);

    // And zooming cannot walk past either end.
    for (let i = 0; i < 40; i++) store.zoomSkyBy(0.5);
    expect(store.get().skyField).toBe(MIN_SKY_FIELD);
  });

  it('goes back to the opening field, and only that', () => {
    store.setZoom(2.5);
    store.setSkyField(0.5);

    store.resetSkyField();

    expect(store.get().skyField).toBe(DEFAULT_SKY_FIELD);
    expect(store.get().zoom).toBe(2.5);
  });

  it('survives a model switch like every other view setting', () => {
    store.setSkyField(12);
    store.setMode('newton');
    expect(store.get().skyField).toBe(12);
  });
});

describe('Phase 2 & 3 layout and evidence state', () => {
  it('keeps evidence tabs mutually exclusive and mirrors showSky/showTrack', () => {
    store.setEvidenceTab('sky');
    expect(store.get().evidenceTab).toBe('sky');
    expect(store.get().showSky).toBe(true);
    expect(store.get().showTrack).toBe(false);

    store.setEvidenceTab('track');
    expect(store.get().evidenceTab).toBe('track');
    expect(store.get().showSky).toBe(false);
    expect(store.get().showTrack).toBe(true);

    store.setEvidenceTab('scorecard');
    expect(store.get().evidenceTab).toBe('scorecard');
    expect(store.get().showSky).toBe(false);
    expect(store.get().showTrack).toBe(false);

    store.setEvidenceTab(null);
    expect(store.get().evidenceTab).toBeNull();
    expect(store.get().showSky).toBe(false);
    expect(store.get().showTrack).toBe(false);
  });

  it('switches right inspector tabs and top bar popovers cleanly', () => {
    expect(store.get().rightTab).toBe('inspect');
    store.setRightTab('events');
    expect(store.get().rightTab).toBe('events');

    store.setTopPopover('trials');
    expect(store.get().activePopover).toBe('trials');
    expect(store.get().showSettings).toBe(false);

    store.setTopPopover('settings');
    expect(store.get().activePopover).toBe('settings');
    expect(store.get().showSettings).toBe(true);

    store.setTopPopover(null);
    expect(store.get().activePopover).toBeNull();
    expect(store.get().showSettings).toBe(false);
  });

  it('applies full guided trial scene properties and dismisses cleanly', () => {
    const venusTrial = DEMONSTRATIONS.find((d) => d.id === 'venus-phases-1610')!;
    store.setTopPopover('trials');
    store.setRightTab('events');
    store.applyDemonstration(venusTrial);

    const state = store.get();
    expect(state.activeTrialId).toBe('venus-phases-1610');
    expect(state.activePopover).toBeNull();
    expect(state.rightTab).toBe('inspect');
    expect(state.ghostEngineId).toBe('keplerian');
    expect(state.evidenceTab).toBe('sky');
    expect(state.showSky).toBe(true);

    store.dismissTrial();
    expect(store.get().activeTrialId).toBeNull();
  });

  it('enables the recentered composition harness on the Mars equivalence trial', () => {
    const marsTrial = DEMONSTRATIONS.find((d) => d.id === 'mars-composition-2027')!;
    store.applyDemonstration(marsTrial);

    const state = store.get();
    expect(state.activeTrialId).toBe('mars-composition-2027');
    expect(state.mode).toBe('kepler');
    expect(state.frameOrigin).toBe('earth');
    expect(state.selectedBody).toBe('mars');
    expect(state.showRecentredHarness).toBe(true);
    expect(state.ghostEngineId).toBe('ptolemaic-epicyclic');
  });

  it('selects the right body and resets scale, sphere, sight-lines and skyField across all 8 trials', () => {
    const expectedBodies: Record<string, string> = {
      'mars-composition-2027': 'mars',
      'mars-opposition-1602': 'mars',
      'venus-phases-1610': 'venus',
      'galilean-moons-1610': 'io',
      'mercury-transit-1631': 'mercury',
      'great-conjunction-1603': 'jupiter',
      'great-conjunction-2020': 'saturn',
      'lunar-perturbation-2026': 'moon',
    };

    // Dirty view settings beforehand so we prove each trial resets cleanly.
    store.setScaleMode('true');
    store.setSphereCentre('observer');
    store.toggle('showSightLines');
    store.setSkyField(1);

    for (const trial of DEMONSTRATIONS) {
      store.applyDemonstration(trial);
      const state = store.get();

      expect(state.selectedBody, trial.id).toBe(expectedBodies[trial.id]);
      expect(state.selectedBody, trial.id).not.toBe(state.observationPoint);
      expect(state.mode, trial.id).toBe(trial.mode);
      expect(state.frameOrigin, trial.id).toBe(trial.frameOrigin);
      expect(state.observationPoint, trial.id).toBe(trial.observationPoint);
      expect(state.scaleMode, trial.id).toBe('compressed');
      expect(state.sphereCentre, trial.id).toBe('frame');
      expect(state.showSightLines, trial.id).toBe(true);
      expect(state.skyField, trial.id).toBe(trial.skyField ?? DEFAULT_SKY_FIELD);
    }
  });
});
