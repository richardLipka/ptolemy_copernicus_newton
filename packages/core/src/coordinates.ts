/**
 * Conversions between rectangular ecliptic positions and the angular
 * quantities the sky view and event detector work in.
 *
 * Positions are geometric: light-time, aberration, and nutation are not
 * applied. At this app's resolution — a zodiac sign is 30° wide and the
 * largest omitted effect is ~0.01° — including them would add machinery
 * without changing anything a viewer could see.
 */

import type { BodyId } from './bodies';
import type { PositionSet } from './engines/types';
import { angleDiffDeg, length, normalizeDeg, sub, type Vec3 } from './vec';

export interface SphericalPosition {
  /** Ecliptic longitude, degrees in [0, 360). */
  longitude: number;
  /** Ecliptic latitude, degrees. */
  latitude: number;
  /** Distance from the origin of the vector, AU. */
  distance: number;
}

export function toSpherical(v: Vec3): SphericalPosition {
  const distance = length(v);
  return {
    longitude: normalizeDeg(Math.atan2(v.y, v.x) * (180 / Math.PI)),
    latitude:
      distance === 0 ? 0 : Math.asin(v.z / distance) * (180 / Math.PI),
    distance,
  };
}

/** Position of `target` as seen from `observer`. */
export function relativePosition(
  positions: PositionSet,
  observer: BodyId,
  target: BodyId,
): SphericalPosition {
  const from = positions.get(observer);
  const to = positions.get(target);
  if (!from || !to) {
    throw new Error(`Missing position for "${observer}" or "${target}"`);
  }
  return toSpherical(sub(to, from));
}

/** Apparent ecliptic longitude of `target` seen from `observer`, degrees. */
export const apparentLongitude = (
  positions: PositionSet,
  observer: BodyId,
  target: BodyId,
): number => relativePosition(positions, observer, target).longitude;


/**
 * Angular distance from the Sun along the ecliptic, signed: positive when the
 * body appears east of the Sun (an evening object), negative when west.
 * Its magnitude is what bounds Mercury and Venus to the twilight sky.
 */
export function solarElongation(
  positions: PositionSet,
  observer: BodyId,
  target: BodyId,
): number {
  return angleDiffDeg(
    apparentLongitude(positions, observer, target),
    apparentLongitude(positions, observer, 'sun'),
  );
}

/**
 * Rate of change of apparent longitude, degrees per day, by central
 * difference. Negative means retrograde — the body appears to move backwards
 * against the stars, which is the single phenomenon that cost the Ptolemaic
 * system its epicycles.
 */
export function apparentLongitudeRate(
  positionsAt: (jd: number) => PositionSet,
  jd: number,
  observer: BodyId,
  target: BodyId,
  stepDays = 0.5,
): number {
  const ahead = apparentLongitude(positionsAt(jd + stepDays), observer, target);
  const behind = apparentLongitude(positionsAt(jd - stepDays), observer, target);
  return angleDiffDeg(ahead, behind) / (2 * stepDays);
}
