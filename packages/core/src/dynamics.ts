/**
 * Newton's machinery, made visible.
 *
 * The other two models place a body by construction — circles carrying circles.
 * This one places it by force: every body pulls on every other, and the orbit is
 * whatever falls out. So the honest equivalent of Ptolemy's deferent and
 * epicycle is not a curve at all but the vectors themselves, and this module
 * produces them.
 *
 * Pulls are reported three ways because each answers a different question.
 * Newtons are what "force" usually means and let the Sun's grip be compared
 * with Jupiter's. Acceleration is what the integrator actually applies and what
 * governs the trajectory, the target's own mass having cancelled — Galileo's
 * point, arrived at from the other end. The share of the total says at a glance
 * how nearly two-body the real problem is.
 */

import { BODIES, GRAVITATING_BODY_IDS, type BodyId } from './bodies.js';
import { add, length, scale, sub, type Vec3 } from './vec.js';

/** Metres in an astronomical unit (IAU 2012). */
const AU_IN_METRES = 1.495_978_707e11;
const SECONDS_PER_DAY = 86_400;
/** Newtonian constant of gravitation, m^3 kg^-1 s^-2 (CODATA 2018). */
const GRAVITATIONAL_CONSTANT = 6.674_30e-11;

/** A body's GM in SI units, converted from the AU-and-days form the sim uses. */
const gmInSi = (id: BodyId): number =>
  (BODIES[id].gm * AU_IN_METRES ** 3) / SECONDS_PER_DAY ** 2;

/**
 * Mass in kilograms.
 *
 * Only GM is tabulated, because that is what an ephemeris can actually measure:
 * the product is known to many digits while G itself is the least precisely
 * known constant in physics, so dividing here is the least accurate step in this
 * file. It is done only to put a number on the display.
 */
export const massInKg = (id: BodyId): number => gmInSi(id) / GRAVITATIONAL_CONSTANT;

export interface GravityPull {
  source: BodyId;
  /** Unit vector from the target toward the source — the pull's direction. */
  direction: Vec3;
  /** Force on the target, newtons. */
  newtons: number;
  /** Acceleration imparted on the target, AU/day² — the integrator's own term. */
  acceleration: number;
  /** Share of the summed magnitudes of all pulls, 0 to 1. */
  share: number;
}

export interface Dynamics {
  target: BodyId;
  /** Velocity in the simulation frame, AU/day. */
  velocity: Vec3;
  speedKmPerSecond: number;
  /** Every other body's pull, strongest first. */
  pulls: GravityPull[];
  /** Vector sum of the pulls: the only force that actually moves anything. */
  netDirection: Vec3;
  netNewtons: number;
}

export interface StateVectors {
  positions: Map<BodyId, Vec3>;
  velocities: Map<BodyId, Vec3>;
}

/**
 * Forces and velocity for one body.
 *
 * Works from state vectors rather than an engine so it stays pure and testable;
 * only the n-body engine can supply velocities, which is why only that engine
 * has dynamics to show.
 */
export function dynamicsOf(states: StateVectors, target: BodyId): Dynamics | null {
  const position = states.positions.get(target);
  const velocity = states.velocities.get(target);
  if (!position || !velocity) return null;

  const targetMass = massInKg(target);
  const pulls: GravityPull[] = [];
  let net: Vec3 = { x: 0, y: 0, z: 0 };

  for (const source of GRAVITATING_BODY_IDS) {
    if (source === target) continue;
    const other = states.positions.get(source);
    if (!other) continue;

    const offset = sub(other, position);
    const distance = length(offset);
    if (distance === 0) continue;

    const direction = scale(offset, 1 / distance);
    const distanceInMetres = distance * AU_IN_METRES;

    pulls.push({
      source,
      direction,
      newtons: (gmInSi(source) * targetMass) / distanceInMetres ** 2,
      acceleration: BODIES[source].gm / (distance * distance),
      share: 0,
    });

    // Newtons and AU/day² differ only by a constant for a fixed target, so the
    // summed direction is the same either way.
    net = add(net, scale(direction, pulls[pulls.length - 1]!.newtons));
  }

  pulls.sort((a, b) => b.newtons - a.newtons);

  const total = pulls.reduce((sum, pull) => sum + pull.newtons, 0);
  for (const pull of pulls) pull.share = total === 0 ? 0 : pull.newtons / total;

  const netMagnitude = length(net);

  return {
    target,
    velocity,
    // AU/day to km/s.
    speedKmPerSecond: (length(velocity) * AU_IN_METRES) / SECONDS_PER_DAY / 1000,
    pulls,
    netDirection: netMagnitude === 0 ? { x: 0, y: 0, z: 0 } : scale(net, 1 / netMagnitude),
    netNewtons: netMagnitude,
  };
}

export type DynamicsSource = (jd: number, target: BodyId) => Dynamics | null;
