import { describe, expect, it } from 'vitest';

import { AU_IN_KM, BODIES } from '../bodies.js';
import { apparentLongitude, toSpherical } from '../coordinates.js';
import { J2000, jdFromCalendar } from '../time.js';
import { angleDiffDeg, length, normalizeDeg } from '../vec.js';
import {
  elementsAt,
  heliocentricAt,
  keplerianPositions,
  keplerianStates,
  meanAnomalyAt,
  moonGeocentricAt,
  solveKepler,
} from './keplerian.js';

describe('solveKepler', () => {
  it('is exact for a circular orbit', () => {
    expect(solveKepler(42, 0)).toBeCloseTo(42, 9);
  });

  it('satisfies Kepler\'s equation for a highly eccentric orbit', () => {
    const meanAnomaly = 73;
    const e = 0.85;
    const eccAnomaly = solveKepler(meanAnomaly, e);
    const recovered =
      eccAnomaly - (180 / Math.PI) * e * Math.sin((eccAnomaly * Math.PI) / 180);
    expect(recovered).toBeCloseTo(meanAnomaly, 7);
  });
});

describe('Moon position (Meeus example 47.a)', () => {
  // 1992 April 12.0 TD. Meeus gives lambda = 133.162655, beta = -3.229126,
  // distance = 368409.7 km. Our series is truncated, so tolerances are loose
  // enough to allow the omitted terms but tight enough to catch a real error.
  const jd = jdFromCalendar(1992, 4, 12);
  const moon = toSpherical(moonGeocentricAt(jd));

  it('gives the right ecliptic longitude', () => {
    expect(moon.longitude).toBeCloseTo(133.162655, 1);
  });

  it('gives the right ecliptic latitude', () => {
    expect(moon.latitude).toBeCloseTo(-3.229126, 1);
  });

  it('gives the right distance', () => {
    expect(moon.distance * AU_IN_KM).toBeGreaterThan(368_300);
    expect(moon.distance * AU_IN_KM).toBeLessThan(368_520);
  });
});

describe('Sun as seen from Earth', () => {
  it('has geometric longitude ~280.38 deg at J2000', () => {
    const longitude = apparentLongitude(keplerianPositions(J2000), 'earth', 'sun');
    expect(longitude).toBeCloseTo(280.38, 1);
  });

  it('advances through a full circle over one year', () => {
    const start = apparentLongitude(keplerianPositions(J2000), 'earth', 'sun');
    const later = apparentLongitude(
      keplerianPositions(J2000 + 365.256363),
      'earth',
      'sun',
    );
    expect(normalizeDeg(later - start)).toBeLessThan(0.05);
  });
});

describe('orbital geometry stays physical across the supported range', () => {
  const sampleJds = [
    jdFromCalendar(1600, 1, 1),
    jdFromCalendar(1800, 6, 15),
    J2000,
    jdFromCalendar(2200, 3, 3),
    jdFromCalendar(2400, 1, 1),
  ];

  for (const id of ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn'] as const) {
    it(`keeps ${id} between perihelion and aphelion`, () => {
      for (const jd of sampleJds) {
        const model = BODIES[id].orbit!;
        const el = elementsAt(jd, model);
        const r = length(heliocentricAt(jd, id));
        expect(r).toBeGreaterThanOrEqual(el.a * (1 - el.e) - 1e-6);
        expect(r).toBeLessThanOrEqual(el.a * (1 + el.e) + 1e-6);
      }
    });
  }

  it('keeps the Moon within its real distance range', () => {
    for (const jd of sampleJds) {
      const km = length(moonGeocentricAt(jd)) * AU_IN_KM;
      expect(km).toBeGreaterThan(355_000);
      expect(km).toBeLessThan(407_000);
    }
  });
});

describe('mean anomaly', () => {
  it('completes one revolution per orbital period', () => {
    // Mars: 686.98 days.
    const start = meanAnomalyAt(J2000, BODIES.mars.orbit!);
    const later = meanAnomalyAt(J2000 + 686.98, BODIES.mars.orbit!);
    expect(Math.abs(angleDiffDeg(later, start))).toBeLessThan(0.2);
  });
});

describe('state vectors', () => {
  it('produce velocities consistent with finite differences of position', () => {
    const jd = jdFromCalendar(2024, 6, 1);
    const step = 0.01;
    const states = keplerianStates(jd);

    // Tolerance is relative: a central difference carries O(step^2) truncation
    // error, so demanding absolute precision here would test the difference
    // scheme rather than the analytic velocity.
    for (const id of ['mercury', 'earth', 'jupiter'] as const) {
      const state = states.get(id)!;
      const ahead = keplerianPositions(jd + step).get(id)!;
      const behind = keplerianPositions(jd - step).get(id)!;
      const numericalVx = (ahead.x - behind.x) / (2 * step);
      const numericalVy = (ahead.y - behind.y) / (2 * step);
      const speed = Math.hypot(numericalVx, numericalVy);

      expect(Math.abs(state.velocity.x - numericalVx) / speed).toBeLessThan(1e-3);
      expect(Math.abs(state.velocity.y - numericalVy) / speed).toBeLessThan(1e-3);
    }
  });
});

describe('Earth-Moon barycentre handling', () => {
  it('places Earth and Moon on opposite sides of the barycentre', () => {
    const jd = jdFromCalendar(2024, 6, 1);
    const positions = keplerianPositions(jd);
    const earth = positions.get('earth')!;
    const moon = positions.get('moon')!;
    const separationKm = length({
      x: moon.x - earth.x,
      y: moon.y - earth.y,
      z: moon.z - earth.z,
    }) * AU_IN_KM;

    expect(separationKm).toBeGreaterThan(355_000);
    expect(separationKm).toBeLessThan(407_000);
  });
});
