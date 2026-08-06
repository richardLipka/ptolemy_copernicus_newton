/**
 * The package's own front door, used the way a dependent project uses it.
 *
 * Everything else here imports by relative path, which exercises the *files* but
 * never the `exports` map, the barrel or the package name. Those are what a
 * consumer actually touches, and a mistake in them is invisible from inside:
 * `tsc` will happily verify a re-export that no bundler can resolve.
 *
 * The parameter case runs the README's example verbatim. Documentation that has
 * never been executed is a guess, and this one makes a claim worth checking —
 * that you can take a copy, edit it, and leave the shared historical constants
 * alone. The example used `structuredClone` until this test found that a
 * DOM-free consumer cannot see that global, which is the sort of thing only an
 * executed example catches.
 */
import { describe, expect, it } from 'vitest';

// 1. the curated root barrel
import { BODIES, ENGINES, jdFromCalendar, vec3, apparentLongitude } from '@orrery/core';
// 2. a single engine by subpath
import { keplerianPositions } from '@orrery/core/engines/keplerian';
// 3. the parameter API the README documents
import {
  ALMAGEST_PARAMETERS,
  clonePtolemaicParameters,
  createPtolemaicEngine,
} from '@orrery/core/engines/ptolemaic';
// 4. a leaf module
import { buildLongitudeTrack, trackWindowDays } from '@orrery/core/longitudeTrack';

describe('consuming @orrery/core across the package boundary', () => {
  it('resolves the root barrel', () => {
    expect(BODIES.mars.id).toBe('mars');
    expect(typeof jdFromCalendar).toBe('function');
    expect(vec3(1, 2, 3).y).toBe(2);
    expect(Object.keys(ENGINES)).toHaveLength(8);
  });

  it('resolves engine subpaths', () => {
    const jd = jdFromCalendar(2026, 8, 6);
    expect(keplerianPositions(jd).get('mars')).toBeDefined();
  });

  it('runs the README’s parameter example verbatim', () => {
    const mine = clonePtolemaicParameters(ALMAGEST_PARAMETERS);
    mine.planets.mars!.epicycleRadius = 41;
    const engine = createPtolemaicEngine(mine);

    const jd = jdFromCalendar(2026, 8, 6);
    const mars = engine.positionsAt(jd).get('mars')!;
    expect(Number.isFinite(mars.x)).toBe(true);

    // and it must differ from the default, or the example is a lie
    const base = createPtolemaicEngine(ALMAGEST_PARAMETERS);
    expect(mars.x).not.toBeCloseTo(base.positionsAt(jd).get('mars')!.x, 6);
    // the original must be untouched by the clone
    expect(ALMAGEST_PARAMETERS.planets.mars!.epicycleRadius).toBe(39.5);
  });

  it('resolves a leaf module and composes with an engine', () => {
    const jd = jdFromCalendar(2026, 8, 6);
    const engine = createPtolemaicEngine(ALMAGEST_PARAMETERS);
    const track = buildLongitudeTrack(
      (at) => engine.positionsAt(at),
      jd,
      'earth',
      'mars',
      trackWindowDays('earth', 'mars'),
    );
    expect(track.segments.length).toBeGreaterThan(100);
    expect(apparentLongitude(engine.positionsAt(jd), 'earth', 'mars')).toBeGreaterThanOrEqual(0);
  });
});
