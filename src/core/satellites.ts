/**
 * Moons, and why they are placed the same way in every model.
 *
 * The four Galileans and Titan are here as a demonstration of orbits within
 * orbits — a system that keeps its own time inside the one the app is otherwise
 * about. They are *placed* identically under Ptolemy, Copernicus, Kepler and
 * Newton, and that is not laziness: **no pre-1610 model contains them at all.**
 * Ptolemy had never heard of them, and Copernicus died sixty-seven years before
 * anyone saw one. What changes when you switch model is where *Jupiter* is; the
 * moons ride along.
 *
 * Which is itself the point Galileo made. Four bodies plainly going round
 * something that is not the Earth was the first observation the geocentric
 * system had no answer to, and selecting Jupiter in Ptolemy mode puts that
 * contradiction on the screen.
 *
 * Their *harness* does differ by model — see `satelliteHarness.ts`. That is not
 * a claim about history but a counterfactual: given this orbit, what would each
 * model have drawn? Positions stay identical because no model derives them.
 *
 * **Precision is not claimed.** The mean longitudes are approximate, so the
 * configuration on any particular date is not to be trusted. The *periods* are
 * accurate, because the two things worth showing depend only on them:
 *
 *   - Kepler's third law holds inside the Jovian system, to four significant
 *     figures, with a constant of its own — the same law, a different centre.
 *   - Io, Europa and Ganymede are locked in the **Laplace resonance**, 1:2:4,
 *     which is visible within a fortnight of running the clock.
 */

import { BODIES, type BodyId } from './bodies';
import { J2000 } from './time';
import { DEG, add, vec3, type Vec3 } from './vec';

/**
 * Solve Kepler's equation for a satellite.
 *
 * Its own small solver rather than the one in `keplerian.ts`, which works in the
 * degrees-and-e* convention JPL's elements use. These orbits are nearly circular
 * — the most eccentric is Titan at 0.029 — so a handful of passes is ample.
 */
function eccentricAnomaly(meanAnomalyRad: number, e: number): number {
  let anomaly = meanAnomalyRad;
  for (let i = 0; i < 12; i++) {
    const delta =
      (anomaly - e * Math.sin(anomaly) - meanAnomalyRad) / (1 - e * Math.cos(anomaly));
    anomaly -= delta;
    if (Math.abs(delta) < 1e-12) break;
  }
  return anomaly;
}

/**
 * Position of a satellite relative to the body it orbits, AU.
 *
 * Returns null for anything that is not a satellite, so callers can ask about
 * any body without checking first.
 */
export function satelliteOffsetAt(jd: number, id: BodyId): Vec3 | null {
  const orbit = BODIES[id].satellite;
  if (!orbit) return null;

  const meanAnomaly =
    ((orbit.epochLongitude - orbit.peri + (360 / orbit.periodDays) * (jd - J2000)) % 360) *
    DEG;
  const ecc = eccentricAnomaly(meanAnomaly, orbit.e);

  // In the orbital plane, pericentre along +x.
  const xPlane = orbit.a * (Math.cos(ecc) - orbit.e);
  const yPlane = orbit.a * Math.sqrt(1 - orbit.e * orbit.e) * Math.sin(ecc);

  const argPeri = (orbit.peri - orbit.node) * DEG;
  const node = orbit.node * DEG;
  const inc = orbit.i * DEG;

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

/**
 * Hang every satellite off its primary, wherever that model has put it.
 *
 * Called by each engine after it has placed the planets. A satellite whose
 * primary is missing from the set is skipped rather than dropped at the origin,
 * which would draw Io at the centre of the map.
 */
export function addSatellites(jd: number, positions: Map<BodyId, Vec3>): void {
  for (const id of Object.keys(BODIES) as BodyId[]) {
    const offset = satelliteOffsetAt(jd, id);
    if (!offset) continue;

    const parent = BODIES[id].parent;
    const primary = parent ? positions.get(parent) : undefined;
    if (!primary) continue;

    positions.set(id, add(primary, offset));
  }
}

/** Sidereal period, days — the figure the demonstrations actually rest on. */
export const satellitePeriod = (id: BodyId): number | null =>
  BODIES[id].satellite?.periodDays ?? null;

/** True whether or not the body is currently on the map. */
export const isSatellite = (id: BodyId): boolean => BODIES[id].satellite !== undefined;

/** Convenience for callers holding a finished position set. */
export const primaryOf = (id: BodyId): BodyId | null =>
  BODIES[id].satellite ? BODIES[id].parent : null;
