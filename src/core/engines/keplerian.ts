/**
 * Two-body Keplerian ephemeris, wearing two hats.
 *
 * As a **model** it is Kepler's, the fourth selectable mode: elliptical orbits
 * with the Sun at a focus, and a construction to match. Its residual error
 * against the reference is the mutual perturbation it omits, which is precisely
 * what Newton went on to explain.
 *
 * As **infrastructure** it supplies osculating elements, which a positional
 * series like VSOP87 does not give: it seeds the n-body integration, drives the
 * Almagest engine's modern mean longitudes, and provides the lunar theory that
 * every engine here shares.
 *
 * It is *not* the app's ground truth — `vsop87.ts` took that over, because
 * two-body elements put the 2020 great conjunction eleven hours out. See
 * CLAUDE.md §12.7.
 */

import {
  BODIES,
  MOON_TO_EMB_MASS_FRACTION,
  ORBITING_BODY_IDS,
  AU_IN_KM,
  type BodyId,
  type KeplerianElements,
  type OrbitalModel,
} from '../bodies';
import type { Construction } from '../construction';
import { centuriesSinceJ2000 } from '../time';
import {
  DEG,
  add,
  cross,
  dot,
  length,
  normalize,
  scale,
  sub,
  vec3,
  type Vec3,
} from '../vec';
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

/**
 * Earth itself, not the Earth–Moon barycentre the published elements track.
 *
 * Extracted because the construction needs exactly the position the engine
 * reports, or the Moon's harness would hang a few thousand kilometres off the
 * Earth it is supposed to be centred on.
 */
export function earthPositionAt(jd: number): Vec3 {
  return sub(
    heliocentricAt(jd, 'earth'),
    scale(moonGeocentricAt(jd), MOON_TO_EMB_MASS_FRACTION),
  );
}

export function keplerianPositions(jd: number): Map<BodyId, Vec3> {
  const positions = new Map<BodyId, Vec3>();
  positions.set('sun', vec3(0, 0, 0));

  for (const id of ORBITING_BODY_IDS) {
    positions.set(id, heliocentricAt(jd, id));
  }

  // Published elements track the Earth–Moon barycentre; shift to Earth itself.
  const moonOffset = moonGeocentricAt(jd);
  const earth = sub(positions.get('earth')!, scale(moonOffset, MOON_TO_EMB_MASS_FRACTION));

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

// --- Kepler's construction ----------------------------------------------

/**
 * The first law, drawn.
 *
 * Where Ptolemy needs four devices and Copernicus needs a circle and an arm,
 * Kepler needs one curve and one point on it. The harness shows what is *not*
 * there as much as what is: two foci with the Sun on one and nothing at all on
 * the other, and a geometric centre that no longer governs anything. Set beside
 * the Ptolemaic panel — where the equant is marked most strongly of all — the
 * pair makes the argument that a century of eccentrics and equants was an
 * elaborate way of approximating this.
 *
 * The radius vector is drawn brightest because its *sweep* is the second law,
 * which the first law alone cannot show: run the clock and watch it move
 * quickly at perihelion and slowly at aphelion.
 */
export function keplerianConstruction(jd: number, id: BodyId): Construction | null {
  // The Sun is the focus everything else is drawn about, so it has no orbit of
  // its own here.
  if (id === 'sun') return null;
  if (id === 'moon') return moonOsculatingConstruction(jd);

  const model = BODIES[id].orbit;
  if (!model) return null;

  const el = elementsAt(jd, model);
  const { a, e } = el;
  const semiMinor = a * Math.sqrt(1 - e * e);

  /*
   * `orbitalPlaneToEcliptic` is a pure rotation — no translation — so it maps
   * free vectors exactly as it maps points, and the semi-axes can be carried
   * into the ecliptic frame directly.
   *
   * In the plane coordinates that `positionFromElements` uses, x = a(cos E − e)
   * and y = b sin E, which puts the occupied focus at the origin and the
   * geometric centre a distance ae behind it, along the line of apsides.
   */
  const centre = orbitalPlaneToEcliptic(-a * e, 0, el);
  const majorAxis = orbitalPlaneToEcliptic(a, 0, el);
  const minorAxis = orbitalPlaneToEcliptic(0, semiMinor, el);

  const occupiedFocus = vec3(0, 0, 0);
  const emptyFocus = orbitalPlaneToEcliptic(-2 * a * e, 0, el);
  const perihelion = orbitalPlaneToEcliptic(a * (1 - e), 0, el);
  const aphelion = orbitalPlaneToEcliptic(-a * (1 + e), 0, el);

  // A point on the ellipse by construction. For Earth this is the Earth–Moon
  // barycentre rather than the marker's own position, the two differing by
  // about 4700 km — some three hundredths of a pixel at this scale.
  const body = positionFromElements(el, meanAnomalyAt(jd, model));

  return {
    circles: [],
    ellipses: [{ centre, majorAxis, minorAxis, role: 'orbit' }],
    arms: [
      { from: perihelion, to: aphelion, role: 'apsidal' },
      { from: occupiedFocus, to: body, role: 'radius' },
    ],
    markers: [
      { at: occupiedFocus, role: 'focus' },
      { at: emptyFocus, role: 'focus' },
      { at: centre, role: 'centre' },
    ],
  };
}

/**
 * The Moon's *osculating* ellipse — and why it is the most interesting figure
 * in the app.
 *
 * The other bodies here are placed **by** an ellipse: the engine solves Kepler's
 * equation and the drawn curve is the calculation itself. The Moon is not. Its
 * position comes from a truncated Meeus lunar theory, a sum of periodic terms,
 * because no fixed ellipse describes the Moon well enough to be worth having —
 * a circle of the mean distance is out by up to 27 700 km.
 *
 * So this ellipse is derived from the answer rather than being the answer: the
 * unique two-body orbit tangent to the Moon's true motion at this instant,
 * reconstructed from its position and velocity. It passes through the Moon by
 * construction, and it is exactly what Kepler's laws assert about the Moon
 * *right now*.
 *
 * The point is that it will not hold still. Run the clock and watch it breathe —
 * measured over 2026–2030 the osculating eccentricity swings between 0.026 and
 * 0.077, very nearly a factor of three, and the semi-major axis wanders over
 * 8200 km. That is the Sun pulling on the Earth–Moon pair, and it is the reason
 * the Moon defeated everyone: Ptolemy bolted a crank onto his lunar model to
 * chase it, and it took Newton to say what it *was*. A planet's ellipse sits
 * still because nothing much disturbs it; the Moon's does not, and the harness
 * should show that rather than hide it behind a tidy fixed curve.
 */
export function moonOsculatingConstruction(jd: number): Construction | null {
  const earth = earthPositionAt(jd);
  const r = moonGeocentricAt(jd);
  const v = moonGeocentricVelocityAt(jd);

  // Relative motion of a two-body pair is governed by the *sum* of the two GMs.
  const mu = BODIES.earth.gm + BODIES.moon.gm;

  const radius = length(r);
  const speedSquared = dot(v, v);

  // Eccentricity vector: magnitude e, pointing from the focus to perigee.
  const eccentricity = scale(
    sub(scale(r, speedSquared - mu / radius), scale(v, dot(r, v))),
    1 / mu,
  );
  const e = length(eccentricity);

  // Vis-viva rearranged. A hyperbolic orbit would give a <= 0; the Moon's never
  // is, but a bound orbit is what the rest of this assumes.
  const a = 1 / (2 / radius - speedSquared / mu);
  if (!(a > 0) || e >= 1) return null;

  const semiMinor = a * Math.sqrt(1 - e * e);

  // In-plane axes: toward perigee, and perpendicular to it in the direction of
  // travel. Taken from the angular momentum so the ellipse carries the orbit's
  // real tilt rather than being flattened into the ecliptic.
  const toPerigee = e > 0 ? scale(eccentricity, 1 / e) : normalize(r);
  const normal = normalize(cross(r, v));
  const alongMotion = cross(normal, toPerigee);

  const centre = scale(toPerigee, -a * e);
  const emptyFocus = scale(toPerigee, -2 * a * e);
  const perigee = scale(toPerigee, a * (1 - e));
  const apogee = scale(toPerigee, -a * (1 + e));

  // Every point is expressed about Earth and then carried into the engine's
  // heliocentric frame, which is where the view expects construction geometry.
  const about = (point: Vec3): Vec3 => add(earth, point);

  return {
    circles: [],
    ellipses: [
      {
        centre: about(centre),
        majorAxis: scale(toPerigee, a),
        minorAxis: scale(alongMotion, semiMinor),
        role: 'orbit',
      },
    ],
    arms: [
      { from: about(perigee), to: about(apogee), role: 'apsidal' },
      { from: earth, to: about(r), role: 'radius' },
    ],
    markers: [
      { at: earth, role: 'focus' },
      { at: about(emptyFocus), role: 'focus' },
      { at: about(centre), role: 'centre' },
    ],
  };
}

export const keplerianEngine: Engine = {
  id: 'keplerian',
  positionsAt: (jd: number): PositionSet => keplerianPositions(jd),
  construction: keplerianConstruction,
};

