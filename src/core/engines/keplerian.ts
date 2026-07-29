/**
 * Accurate two-body ephemeris. This is the app's ground truth: the Copernican
 * and Ptolemaic engines are measured against it, the n-body integrator is
 * seeded from it, and the "how wrong was this model?" readouts are differences
 * from it.
 */

import {
  BODIES,
  BODY_IDS,
  MOON_TO_EMB_MASS_FRACTION,
  ORBITING_BODY_IDS,
  AU_IN_KM,
  type BodyId,
  type KeplerianElements,
  type OrbitalModel,
} from '../bodies';
import { centuriesSinceJ2000 } from '../time';
import { DEG, add, scale, sub, vec3, type Vec3 } from '../vec';
import type { Engine, PositionSet, StateVector } from './types';

/** Resolve mean elements to a given date by applying secular rates. */
export function elementsAt(jd: number, model: OrbitalModel): KeplerianElements {
  const t = centuriesSinceJ2000(jd);
  const { epoch, rates } = model;
  return {
    a: epoch.a + rates.a * t,
    e: epoch.e + rates.e * t,
    i: epoch.i + rates.i * t,
    L: epoch.L + rates.L * t,
    peri: epoch.peri + rates.peri * t,
    node: epoch.node + rates.node * t,
  };
}

/** Mean anomaly in degrees, wrapped to (-180, 180], with Jupiter/Saturn's
 *  great-inequality correction applied where present. */
export function meanAnomalyAt(jd: number, model: OrbitalModel): number {
  const el = elementsAt(jd, model);
  let m = el.L - el.peri;

  if (model.correction) {
    const t = centuriesSinceJ2000(jd);
    const { b, c, s, f } = model.correction;
    m += b * t * t + c * Math.cos(f * t * DEG) + s * Math.sin(f * t * DEG);
  }

  m = ((m % 360) + 360) % 360;
  return m > 180 ? m - 360 : m;
}

/**
 * Solve Kepler's equation M = E - e* sin E for the eccentric anomaly, with all
 * angles in degrees and e* = e in degrees per the JPL formulation.
 */
export function solveKepler(meanAnomalyDeg: number, e: number): number {
  const eStar = (180 / Math.PI) * e;
  let ecc = meanAnomalyDeg + eStar * Math.sin(meanAnomalyDeg * DEG);

  for (let iter = 0; iter < 32; iter++) {
    const deltaM = meanAnomalyDeg - (ecc - eStar * Math.sin(ecc * DEG));
    const deltaE = deltaM / (1 - e * Math.cos(ecc * DEG));
    ecc += deltaE;
    if (Math.abs(deltaE) < 1e-9) break;
  }

  return ecc;
}

/** Rotate in-plane orbital coordinates into the ecliptic frame. */
function orbitalPlaneToEcliptic(
  xPlane: number,
  yPlane: number,
  el: KeplerianElements,
): Vec3 {
  const argPeri = (el.peri - el.node) * DEG;
  const node = el.node * DEG;
  const inc = el.i * DEG;

  const cosW = Math.cos(argPeri);
  const sinW = Math.sin(argPeri);
  const cosN = Math.cos(node);
  const sinN = Math.sin(node);
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);

  return vec3(
    (cosW * cosN - sinW * sinN * cosI) * xPlane +
      (-sinW * cosN - cosW * sinN * cosI) * yPlane,
    (cosW * sinN + sinW * cosN * cosI) * xPlane +
      (-sinW * sinN + cosW * cosN * cosI) * yPlane,
    sinW * sinI * xPlane + cosW * sinI * yPlane,
  );
}

/** Heliocentric position from a resolved element set. */
export function positionFromElements(
  el: KeplerianElements,
  meanAnomalyDeg: number,
): Vec3 {
  const eccAnomaly = solveKepler(meanAnomalyDeg, el.e) * DEG;
  const xPlane = el.a * (Math.cos(eccAnomaly) - el.e);
  const yPlane = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(eccAnomaly);
  return orbitalPlaneToEcliptic(xPlane, yPlane, el);
}

/** Position of a body's Keplerian orbit centre-of-motion at a date. For Earth
 *  this is the Earth–Moon barycentre, not Earth itself. */
export function heliocentricAt(jd: number, id: BodyId): Vec3 {
  const model = BODIES[id].orbit;
  if (!model) throw new Error(`Body "${id}" has no Keplerian orbit`);
  return positionFromElements(elementsAt(jd, model), meanAnomalyAt(jd, model));
}

// --- Lunar theory -------------------------------------------------------

/**
 * Periodic terms for the Moon's ecliptic longitude and distance (Meeus,
 * Astronomical Algorithms, table 47.A), truncated to the terms that matter at
 * arcminute precision. Columns: D, M, M', F multipliers, then the longitude
 * coefficient (1e-6 deg) and distance coefficient (1e-3 km).
 */
type LunarTerm4 = readonly [number, number, number, number, number];
type LunarTerm5 = readonly [number, number, number, number, number, number];

const LUNAR_LON_DIST: readonly LunarTerm5[] = [
  [0, 0, 1, 0, 6_288_774, -20_905_355],
  [2, 0, -1, 0, 1_274_027, -3_699_111],
  [2, 0, 0, 0, 658_314, -2_955_968],
  [0, 0, 2, 0, 213_618, -569_925],
  [0, 1, 0, 0, -185_116, 48_888],
  [0, 0, 0, 2, -114_332, -3149],
  [2, 0, -2, 0, 58_793, 246_158],
  [2, -1, -1, 0, 57_066, -152_138],
  [2, 0, 1, 0, 53_322, -170_733],
  [2, -1, 0, 0, 45_758, -204_586],
  [0, 1, -1, 0, -40_923, -129_620],
  [1, 0, 0, 0, -34_720, 108_743],
  [0, 1, 1, 0, -30_383, 104_755],
  [2, 0, 0, -2, 15_327, 10_321],
  [0, 0, 1, 2, -12_528, 0],
  [0, 0, 1, -2, 10_980, 79_661],
  [4, 0, -1, 0, 10_675, -34_782],
  [0, 0, 3, 0, 10_034, -23_210],
  [4, 0, -2, 0, 8548, -21_636],
  [2, 1, -1, 0, -7888, 24_208],
  [2, 1, 0, 0, -6766, 30_824],
  [1, 0, -1, 0, -5163, -8379],
  [1, 1, 0, 0, 4987, -16_675],
  [2, -1, 1, 0, 4036, -12_831],
  [2, 0, 2, 0, 3994, -10_445],
  [4, 0, 0, 0, 3861, -11_650],
  [2, 0, -3, 0, 3665, 14_403],
];

/** Terms for the Moon's ecliptic latitude (Meeus table 47.B), truncated.
 *  Columns: D, M, M', F multipliers, then coefficient in 1e-6 deg. */
const LUNAR_LAT: readonly LunarTerm4[] = [
  [0, 0, 0, 1, 5_128_122],
  [0, 0, 1, 1, 280_602],
  [0, 0, 1, -1, 277_693],
  [2, 0, 0, -1, 173_237],
  [2, 0, -1, 1, 55_413],
  [2, 0, -1, -1, 46_271],
  [2, 0, 0, 1, 32_573],
  [0, 0, 2, 1, 17_198],
  [2, 0, 1, -1, 9266],
  [0, 0, 2, -1, 8822],
  [2, -1, 0, -1, 8216],
  [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200],
  [2, 1, 0, -1, -3359],
  [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065],
  [0, 1, -1, -1, -1870],
  [4, 0, -1, -1, 1828],
  [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749],
  [0, 1, -1, 1, -1565],
  [1, 0, 0, 1, -1491],
  [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410],
  [0, 1, 0, -1, -1344],
  [1, 0, 0, -1, -1335],
  [0, 0, 3, 1, 1107],
  [4, 0, 0, -1, 1021],
];

const polynomial = (t: number, coefficients: readonly number[]): number =>
  coefficients.reduce((sum, c, power) => sum + c * t ** power, 0);

/** Geocentric position of the Moon in ecliptic coordinates, AU. */
export function moonGeocentricAt(jd: number): Vec3 {
  const t = centuriesSinceJ2000(jd);

  const meanLongitude = polynomial(t, [
    218.3164477, 481_267.88123421, -0.0015786, 1 / 538_841, -1 / 65_194_000,
  ]);
  const elongation = polynomial(t, [
    297.8501921, 445_267.1114034, -0.0018819, 1 / 545_868, -1 / 113_065_000,
  ]);
  const sunAnomaly = polynomial(t, [
    357.5291092, 35_999.0502909, -0.0001536, 1 / 24_490_000,
  ]);
  const moonAnomaly = polynomial(t, [
    134.9633964, 477_198.8675055, 0.0087414, 1 / 69_699, -1 / 14_712_000,
  ]);
  const latitudeArgument = polynomial(t, [
    93.272095, 483_202.0175233, -0.0036539, -1 / 3_526_000, 1 / 863_310_000,
  ]);

  // Damps terms involving the Sun's anomaly as Earth's eccentricity changes.
  const eccentricityFactor = 1 - 0.002516 * t - 0.0000074 * t * t;

  let sumLongitude = 0;
  let sumDistance = 0;
  for (const [d, m, mp, f, coefLon, coefDist] of LUNAR_LON_DIST) {
    const argument =
      (d * elongation + m * sunAnomaly + mp * moonAnomaly + f * latitudeArgument) *
      DEG;
    const damping = eccentricityFactor ** Math.abs(m);
    sumLongitude += coefLon * damping * Math.sin(argument);
    sumDistance += coefDist * damping * Math.cos(argument);
  }

  let sumLatitude = 0;
  for (const [d, m, mp, f, coefLat] of LUNAR_LAT) {
    const argument =
      (d * elongation + m * sunAnomaly + mp * moonAnomaly + f * latitudeArgument) *
      DEG;
    sumLatitude += coefLat * eccentricityFactor ** Math.abs(m) * Math.sin(argument);
  }

  const longitude = (meanLongitude + sumLongitude / 1e6) * DEG;
  const latitude = (sumLatitude / 1e6) * DEG;
  const distanceAu = (385_000.56 + sumDistance / 1000) / AU_IN_KM;

  const cosLat = Math.cos(latitude);
  return vec3(
    distanceAu * cosLat * Math.cos(longitude),
    distanceAu * cosLat * Math.sin(longitude),
    distanceAu * Math.sin(latitude),
  );
}

/** Geocentric velocity of the Moon by central difference — accurate enough to
 *  seed the integrator, and far simpler than differentiating the series. */
export function moonGeocentricVelocityAt(jd: number, stepDays = 0.05): Vec3 {
  const ahead = moonGeocentricAt(jd + stepDays);
  const behind = moonGeocentricAt(jd - stepDays);
  return scale(sub(ahead, behind), 1 / (2 * stepDays));
}

// --- Engine -------------------------------------------------------------

export function keplerianPositions(jd: number): Map<BodyId, Vec3> {
  const positions = new Map<BodyId, Vec3>();
  positions.set('sun', vec3(0, 0, 0));

  for (const id of ORBITING_BODY_IDS) {
    positions.set(id, heliocentricAt(jd, id));
  }

  // Published elements track the Earth–Moon barycentre; shift to Earth itself.
  const barycentre = positions.get('earth')!;
  const moonOffset = moonGeocentricAt(jd);
  const earth = sub(barycentre, scale(moonOffset, MOON_TO_EMB_MASS_FRACTION));

  positions.set('earth', earth);
  positions.set('moon', add(earth, moonOffset));

  return positions;
}

/**
 * Heliocentric state vectors for every body, used to seed the n-body run.
 *
 * Velocities are differentiated numerically from `keplerianPositions` rather
 * than derived from the elements analytically. That is not laziness: the
 * positions carry secular element rates, the barycentre correction, the lunar
 * series, and Jupiter and Saturn's great-inequality terms, and every one of
 * those contributes to the true velocity. Differentiating the assembled
 * position captures all of them at once. Doing it analytically meant missing
 * the great-inequality rate — 3% of Saturn's mean motion — which sent the
 * integration 0.1 AU off within a decade.
 *
 * The five-point stencil is O(h^4), so at half-day spacing the truncation
 * error is far below the ephemeris's own accuracy.
 */
export function keplerianStates(jd: number): Map<BodyId, StateVector> {
  const h = 0.5;
  const twoBack = keplerianPositions(jd - 2 * h);
  const back = keplerianPositions(jd - h);
  const here = keplerianPositions(jd);
  const forward = keplerianPositions(jd + h);
  const twoForward = keplerianPositions(jd + 2 * h);

  const states = new Map<BodyId, StateVector>();
  for (const [id, position] of here) {
    const derivative = (component: 'x' | 'y' | 'z'): number =>
      (-twoForward.get(id)![component] +
        8 * forward.get(id)![component] -
        8 * back.get(id)![component] +
        twoBack.get(id)![component]) /
      (12 * h);

    states.set(id, {
      position,
      velocity: vec3(derivative('x'), derivative('y'), derivative('z')),
    });
  }

  return states;
}

export const keplerianEngine: Engine = {
  id: 'keplerian',
  positionsAt: (jd: number): PositionSet => keplerianPositions(jd),
};

export const ALL_BODY_IDS = BODY_IDS;
