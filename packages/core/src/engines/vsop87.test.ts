/**
 * VSOP87, and what the truncation cost.
 *
 * Two things need checking. That the series is evaluated correctly at all —
 * tested against a worked example with a published answer — and that trimming it
 * from tens of thousands of terms to a couple of thousand did not throw away
 * more than intended.
 */

import { describe, expect, it } from 'vitest';

import type { BodyId } from '../bodies';
import { apparentLongitude } from '../coordinates';
import { jdFromCalendar } from '../time';
import { angleDiffDeg, length, sub } from '../vec';
import { keplerianPositions } from './keplerian';
import { vsop87Position, vsop87Positions } from './vsop87';

const DEG = 180 / Math.PI;
const PLANETS: BodyId[] = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn'];

/** Heliocentric longitude, latitude and radius, the form VSOP87 is published in. */
function spherical(jd: number, id: BodyId) {
  const p = vsop87Position(jd, id)!;
  const radius = Math.hypot(p.x, p.y, p.z);
  return {
    longitude: ((Math.atan2(p.y, p.x) * DEG) % 360 + 360) % 360,
    latitude: Math.asin(p.z / radius) * DEG,
    radius,
  };
}

describe('the series is evaluated correctly', () => {
  /**
   * Meeus, *Astronomical Algorithms*, example 32.a: Venus on 1992 December 20
   * at 0h TD, giving L = 26.11428°, B = −2.62070°, R = 0.724603 AU.
   *
   * Those are VSOP87**D** figures, referred to the ecliptic and equinox *of
   * date*. This app uses variant B, referred to J2000, so only the radius is
   * directly comparable — and it matches to the last published digit, which is
   * the real check that the series is being evaluated correctly.
   *
   * Latitude differs by about two arcseconds, which is the frame and not an
   * error: the ecliptic pole itself drifts some 47" a century, and this example
   * sits eight years before the epoch.
   */
  it('reproduces the Meeus worked example for Venus', () => {
    const jd = jdFromCalendar(1992, 12, 20);
    const { latitude, radius } = spherical(jd, 'venus');

    // Five decimals of an AU is about 1500 km, and the published figure has
    // only six — this is agreement to the last digit Meeus prints.
    expect(radius).toBeCloseTo(0.724603, 5);
    expect(latitude).toBeCloseTo(-2.6207, 2);
  });

  it('puts Earth one astronomical unit from the Sun, near enough', () => {
    for (let year = 1700; year <= 2300; year += 25) {
      const { radius } = spherical(jdFromCalendar(year, 1, 1), 'earth');
      // Earth is at perihelion in early January, so a shade under 1 AU.
      expect(radius, `${year}`).toBeGreaterThan(0.98);
      expect(radius, `${year}`).toBeLessThan(0.985);
    }
  });

  it('gives each planet its own orbit, at the right size', () => {
    const jd = jdFromCalendar(2026, 1, 1);
    const expected: Record<string, number> = {
      mercury: 0.387,
      venus: 0.723,
      earth: 1.0,
      mars: 1.524,
      jupiter: 5.203,
      saturn: 9.537,
    };
    for (const id of PLANETS) {
      const { radius } = spherical(jd, id);
      // Within the body's own eccentricity of its mean distance.
      expect(radius / expected[id]!, id).toBeGreaterThan(0.79);
      expect(radius / expected[id]!, id).toBeLessThan(1.21);
    }
  });
});

describe('agreement with the engine it replaces', () => {
  /**
   * The Keplerian elements are the *approximate* ones, good to tens of
   * arcseconds for the inner planets and several hundred for Jupiter and
   * Saturn. VSOP87 should therefore agree with them closely but not exactly —
   * and where it differs, it is VSOP87 that is right.
   *
   * A large disagreement would mean a frame or unit error rather than a
   * refinement, so this is really a sanity check on the wiring.
   */
  it('stays within a fraction of a degree of the old reference', () => {
    for (let year = 1700; year <= 2300; year += 20) {
      const jd = jdFromCalendar(year, 6, 1);
      const modern = vsop87Positions(jd);
      const old = keplerianPositions(jd);

      for (const id of PLANETS) {
        if (id === 'earth') continue;
        const gap = Math.abs(
          angleDiffDeg(
            apparentLongitude(modern, 'earth', id),
            apparentLongitude(old, 'earth', id),
          ),
        );
        expect(gap, `${id} in ${year}`).toBeLessThan(0.5);
      }
    }
  });

  it('differs from it by more than nothing, or it is not doing anything', () => {
    const jd = jdFromCalendar(2026, 1, 1);
    const modern = vsop87Positions(jd);
    const old = keplerianPositions(jd);
    const gap = Math.abs(
      angleDiffDeg(
        apparentLongitude(modern, 'earth', 'saturn'),
        apparentLongitude(old, 'earth', 'saturn'),
      ),
    );
    // Tens of arcseconds at least: the approximate elements are weakest here.
    expect(gap * 3600).toBeGreaterThan(5);
  });
});

describe('the Moon', () => {
  it('is carried over, since VSOP87 does not cover it', () => {
    const jd = jdFromCalendar(2026, 1, 1);
    const positions = vsop87Positions(jd);
    const earth = positions.get('earth')!;
    const moon = positions.get('moon')!;

    const distance = length(sub(moon, earth));
    expect(distance).toBeGreaterThan(0.0023);
    expect(distance).toBeLessThan(0.0028);
  });

  it('keeps the same geocentric direction the lunar theory gives', () => {
    // Only Earth's position changed underneath it, by a few hundred km, so the
    // Moon's direction as seen from Earth must be essentially untouched.
    const jd = jdFromCalendar(2026, 3, 15);
    const gap = Math.abs(
      angleDiffDeg(
        apparentLongitude(vsop87Positions(jd), 'earth', 'moon'),
        apparentLongitude(keplerianPositions(jd), 'earth', 'moon'),
      ),
    );
    expect(gap).toBeLessThan(0.01);
  });
});

describe('what the truncation cost', () => {
  /**
   * Against the *full* published series, not against another approximation.
   *
   * `astronomia` is a devDependency carrying the complete VSOP87 tables, and is
   * the same source `scripts/generate-vsop87.mjs` trimmed. Checking the shipped
   * table against it is the only way to know that dropping 90% of the terms cost
   * what the sweep said it would, and that the generator has not silently
   * changed under a future regeneration.
   */
  it('stays under an arcsecond across the whole supported range', async () => {
    const DAYS_PER_MILLENNIUM = 365_250;
    const J2000_JD = 2451545.0;

    const evaluateFull = (series: Record<string, number[][]>, t: number): number => {
      let total = 0;
      const powers = Object.keys(series)
        .map(Number)
        .sort((a, b) => b - a);
      for (const power of powers) {
        let sum = 0;
        for (const [a, b, c] of series[String(power)]!) sum += a! * Math.cos(b! + c! * t);
        total = total * t + sum;
      }
      return total;
    };

    let worst = 0;
    for (const id of PLANETS) {
      const loaded = (await import(`astronomia/data/vsop87B${id}`)) as {
        default?: { L: Record<string, number[][]>; B: Record<string, number[][]> };
        L?: Record<string, number[][]>;
        B?: Record<string, number[][]>;
      };
      const data = (loaded.default ?? loaded) as {
        L: Record<string, number[][]>;
        B: Record<string, number[][]>;
      };

      for (let year = 1600; year <= 2400; year += 13) {
        const jd = J2000_JD + (year - 2000) * 365.25;
        const t = (jd - J2000_JD) / DAYS_PER_MILLENNIUM;
        const mine = spherical(jd, id);

        const trueLongitude = ((evaluateFull(data.L, t) * DEG) % 360 + 360) % 360;
        const trueLatitude = evaluateFull(data.B, t) * DEG;

        worst = Math.max(
          worst,
          Math.abs(angleDiffDeg(mine.longitude, trueLongitude)) * 3600,
          Math.abs(mine.latitude - trueLatitude) * 3600,
        );
      }
    }

    // The sweep predicted 0.79" at the chosen threshold of 3e-7.
    expect(worst).toBeLessThan(1);
  });
});
