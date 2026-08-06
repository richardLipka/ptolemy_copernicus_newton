/**
 * VSOP87 — the reference ephemeris.
 *
 * A semi-analytic theory: each coordinate is a sum of periodic terms fitted to a
 * numerically integrated ephemeris, so it reproduces the real, mutually
 * perturbing solar system rather than the two-body approximation the Keplerian
 * elements describe. That is the difference between knowing a conjunction to the
 * day and knowing it to the minute.
 *
 * The variant is **VSOP87B**: heliocentric spherical, referred to the mean
 * ecliptic and equinox of J2000 — the frame this app already draws in, so
 * nothing has to be precessed back out again.
 *
 * The Moon is not part of VSOP87, which covers planets only. It keeps the
 * truncated lunar theory in `keplerian.ts`, and Earth's position from here is
 * what the Moon is offset from.
 */

import { BODY_IDS, type BodyId } from '../bodies.js';
import { J2000 } from '../time.js';
import { add, vec3, type Vec3 } from '../vec.js';
import { moonGeocentricAt } from './keplerian.js';
import type { Engine, PositionSet } from './types.js';
import { VSOP87, type Vsop87Series } from './vsop87Data.js';
import { addSatellites } from '../satellites.js';

/** Days in the Julian millennium the series are expressed in. */
const DAYS_PER_MILLENNIUM = 365_250;

/**
 * Evaluate one coordinate's series.
 *
 * Horner's method over the powers of time: each power's terms are summed, then
 * the whole is folded from the highest power down. Written this way it costs one
 * multiply per power rather than a `Math.pow` per term, which matters when the
 * n-body integrator asks for a seed a few thousand times.
 */
function evaluate(series: Vsop87Series, t: number): number {
  let total = 0;
  for (let power = series.length - 1; power >= 0; power--) {
    let sum = 0;
    const terms = series[power]!;
    for (let i = 0; i < terms.length; i++) {
      const [amplitude, phase, frequency] = terms[i]!;
      sum += amplitude * Math.cos(phase + frequency * t);
    }
    total = total * t + sum;
  }
  return total;
}

/** Heliocentric position of one planet, J2000 ecliptic rectangular, AU. */
export function vsop87Position(jd: number, id: BodyId): Vec3 | null {
  const body = VSOP87[id];
  if (!body) return null;

  const t = (jd - J2000) / DAYS_PER_MILLENNIUM;
  const longitude = evaluate(body.L, t);
  const latitude = evaluate(body.B, t);
  const radius = evaluate(body.R, t);

  const cosLatitude = Math.cos(latitude);
  return vec3(
    radius * cosLatitude * Math.cos(longitude),
    radius * cosLatitude * Math.sin(longitude),
    radius * Math.sin(latitude),
  );
}

/**
 * Positions of everything, heliocentric.
 *
 * The Sun sits at the origin, as it does for every other heliocentric engine
 * here — VSOP87 gives positions relative to the Sun's centre, not the
 * barycentre, so no correction is needed.
 */
export function vsop87Positions(jd: number): Map<BodyId, Vec3> {
  const positions = new Map<BodyId, Vec3>();
  positions.set('sun', vec3(0, 0, 0));

  for (const id of BODY_IDS) {
    const position = vsop87Position(jd, id);
    if (position) positions.set(id, position);
  }

  // The Moon comes from the lunar theory, offset from VSOP87's Earth rather
  // than the Keplerian one it was computed against — a difference of a few
  // hundred kilometres, far below that theory's own accuracy.
  //
  // Taken straight from the geocentric series rather than by subtracting two
  // heliocentric positions: the difference is what that series returns anyway,
  // and going the long way round meant evaluating an entire Keplerian ephemeris
  // — all eight orbits, Newton iteration and all — on every call to the
  // reference engine, for one vector.
  const earth = positions.get('earth');
  if (earth) positions.set('moon', add(earth, moonGeocentricAt(jd)));

  addSatellites(jd, positions);
  return positions;
}

export const vsop87Engine: Engine = {
  id: 'vsop87',
  positionsAt: (jd: number): PositionSet => vsop87Positions(jd),
};
