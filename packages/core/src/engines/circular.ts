/**
 * The Copernican model: heliocentric, but with every orbit a perfect circle
 * traversed at uniform speed.
 *
 * The circularity is deliberate and is the point of this engine. Copernicus
 * got the arrangement right and the shape wrong, and keeping his error intact
 * is what lets the app show that heliocentrism alone did not buy better
 * predictions — that took Kepler's ellipses. Divergence from the reference
 * grows with orbital eccentricity, so Mars and Mercury drift most; setting this
 * engine against `keplerian`, which shares its arrangement and differs only in
 * the shape of the orbit, isolates exactly what the circles cost.
 */

import {
  BODIES,
  ORBITING_BODY_IDS,
  AU_IN_KM,
  type BodyId,
  type OrbitalModel,
} from '../bodies.js';
import type { Construction } from '../construction.js';
import { centuriesSinceJ2000 } from '../time.js';
import { DEG, add, vec3, type Vec3 } from '../vec.js';
import { elementsAt } from './keplerian.js';
import type { Engine, PositionSet } from './types.js';
import { addSatellites } from '../satellites.js';

/** Mean distance of the Moon from Earth, AU. */
const MOON_MEAN_DISTANCE = 385_000.56 / AU_IN_KM;
const MOON_INCLINATION = 5.145;

/**
 * Place a body on a circle of radius `radius`, inclined by `inclination` about
 * the line of nodes, at argument of latitude `u` (all angles in degrees).
 */
function onCircularOrbit(
  radius: number,
  u: number,
  inclination: number,
  node: number,
): Vec3 {
  const cosU = Math.cos(u * DEG);
  const sinU = Math.sin(u * DEG);
  const cosN = Math.cos(node * DEG);
  const sinN = Math.sin(node * DEG);
  const cosI = Math.cos(inclination * DEG);
  const sinI = Math.sin(inclination * DEG);

  return vec3(
    radius * (cosN * cosU - sinN * sinU * cosI),
    radius * (sinN * cosU + cosN * sinU * cosI),
    radius * sinU * sinI,
  );
}

/** Circular heliocentric position: mean longitude on a circle of mean radius. */
export function circularHeliocentricAt(jd: number, model: OrbitalModel): Vec3 {
  const el = elementsAt(jd, model);
  return onCircularOrbit(el.a, el.L - el.node, el.i, el.node);
}

/** The Moon on a circle of mean radius about Earth, at its mean longitude. */
export function circularMoonGeocentricAt(jd: number): Vec3 {
  const t = centuriesSinceJ2000(jd);
  const meanLongitude =
    218.3164477 + 481_267.88123421 * t - 0.0015786 * t * t;
  const node = 125.0445479 - 1934.1362891 * t;
  return onCircularOrbit(
    MOON_MEAN_DISTANCE,
    meanLongitude - node,
    MOON_INCLINATION,
    node,
  );
}

export function circularPositions(jd: number): Map<BodyId, Vec3> {
  const positions = new Map<BodyId, Vec3>();
  positions.set('sun', vec3(0, 0, 0));

  for (const id of ORBITING_BODY_IDS) {
    positions.set(id, circularHeliocentricAt(jd, BODIES[id].orbit!));
  }

  // Copernicus made no barycentre correction, so Earth sits on its circle and
  // the Moon simply hangs off it.
  const earth = positions.get('earth')!;
  positions.set('moon', add(earth, circularMoonGeocentricAt(jd)));

  addSatellites(jd, positions);
  return positions;
}

/**
 * The Copernican construction: a circle, and an arm sweeping round it.
 *
 * There is deliberately little to it. That spareness is the point — set beside
 * the Ptolemaic harness of deferent, eccentric, equant and epicycle, this is
 * what Copernicus was actually offering, and it is why his system was received
 * as an enormous simplification even though it predicted the planets no better.
 */
export function circularConstruction(jd: number, id: BodyId): Construction | null {
  if (id === 'sun') return null;

  if (id === 'moon') {
    const earth = circularHeliocentricAt(jd, BODIES.earth.orbit!);
    return {
      circles: [{ centre: earth, radius: MOON_MEAN_DISTANCE, role: 'deferent' }],
      arms: [
        { from: earth, to: add(earth, circularMoonGeocentricAt(jd)), role: 'deferent-arm' },
      ],
      markers: [{ at: earth, role: 'centre' }],
    };
  }

  const model = BODIES[id].orbit;
  if (!model) return null;

  const centre = vec3(0, 0, 0);
  return {
    circles: [
      { centre, radius: elementsAt(jd, model).a, role: 'deferent' },
    ],
    arms: [{ from: centre, to: circularHeliocentricAt(jd, model), role: 'deferent-arm' }],
    markers: [{ at: centre, role: 'centre' }],
  };
}

export const circularEngine: Engine = {
  id: 'circular',
  positionsAt: (jd: number): PositionSet => circularPositions(jd),
  construction: circularConstruction,
};
