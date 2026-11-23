import { describe, expect, it } from 'vitest';

import { jdFromCalendar } from '@orrery/core/time';
import type { State } from '../../state/store';
import { buildScorecard } from './scorecard';

function makeState(overrides: Partial<State> = {}): State {
  return {
    mode: 'ptolemy',
    engineId: 'ptolemaic-epicyclic',
    ghostEngineId: null,
    frameOrigin: 'earth',
    observationPoint: 'earth',
    selectedBody: 'venus',
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
    showRecentredHarness: false,
    showTrack: false,
    showSky: false,
    evidenceTab: 'scorecard',
    rightTab: 'inspect',
    activePopover: null,
    activeTrialId: null,
    showMoons: false,
    skyField: 40,
    locale: 'en',
    theme: 'orrery',
    showCalculation: false,
    showSettings: false,
    showWelcome: false,
    showNotes: false,
    julianDate: jdFromCalendar(1610, 10, 15),
    playing: false,
    rateDaysPerSecond: 1,
    ...overrides,
  };
}

describe('Model Capability Scorecard', () => {
  it('returns null when nothing or the observer itself is selected', () => {
    expect(buildScorecard(makeState({ selectedBody: null }))).toBeNull();
    expect(buildScorecard(makeState({ selectedBody: 'earth', observationPoint: 'earth' }))).toBeNull();
  });

  it('contrasts Ptolemy’s capped Venus phase, flat latitude, and dimensionless parts against heliocentric models', () => {
    const result = buildScorecard(makeState({ selectedBody: 'venus' }))!;
    expect(result.body).toBe('venus');
    expect(result.columns.map((c) => c.mode)).toEqual(['ptolemy', 'copernicus', 'kepler', 'newton']);

    const [ptolemy, copernicus, kepler, newton] = result.columns;

    expect(ptolemy!.phaseCapped).toBe(true);
    expect(ptolemy!.phaseCapPercent).toBe(44);
    expect(ptolemy!.illumination.illuminatedFraction).toBeLessThan(0.5);
    expect(ptolemy!.flatLatitude).toBe(true);
    expect(ptolemy!.deferentParts).not.toBeNull();
    expect(ptolemy!.netForceNewtons).toBeNull();

    expect(copernicus!.phaseCapped).toBe(false);
    expect(copernicus!.illumination.illuminatedFraction).toBeGreaterThan(0.5);
    expect(copernicus!.deferentParts).toBeNull();

    expect(kepler!.phaseCapped).toBe(false);
    expect(kepler!.flatLatitude).toBe(false);
    expect(kepler!.illumination.illuminatedFraction).toBeGreaterThan(0.5);

    expect(newton!.netForceNewtons).toBeGreaterThan(0);
    expect(newton!.flatLatitude).toBe(false);
  });
});
