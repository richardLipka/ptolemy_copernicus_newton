/**
 * The Newtonian model: nothing is prescribed but the inverse-square law.
 *
 * Where the other engines are told what shape to trace, this one is given only
 * masses, an initial state, and F = Gm1m2/r^2. Ellipses, Kepler's equal-area
 * rule, apsidal precession, and the Jupiter-Saturn great inequality all emerge
 * from the integration rather than being written in. That is the whole point
 * of the mode, so the integrator must be honest: no Keplerian fallback, no
 * nudging the result back towards the reference ephemeris.
 */

import { BODIES, GRAVITATING_BODY_IDS, type BodyId } from '../bodies';
import { dynamicsOf, type Dynamics, type StateVectors } from '../dynamics';
import { J2000, MAX_JD, MIN_JD } from '../time';
import { ZERO, add, scale, sub, vec3, type Vec3 } from '../vec';
import { keplerianStates } from './keplerian';
import type { Engine, PositionSet, StateVector } from './types';
import { addSatellites } from '../satellites';

/**
 * Integration step, days. The Moon sets this: it laps its orbit ~10,700 times
 * across the supported range, so any per-orbit phase error is multiplied by
 * that before it reaches the screen. Plain velocity-Verlet at 0.1 days left
 * the Moon a full quadrant out of position by 1600, which is why the
 * integrator is 4th order rather than 2nd.
 */
const DEFAULT_STEP_DAYS = 0.25;

/**
 * Yoshida's 4th-order symplectic composition: three Verlet sub-steps whose
 * lengths are tuned to cancel the leading error term. The middle one runs
 * backwards, which is what makes the cancellation work.
 *
 * Three force evaluations per step buys O(dt^4) accuracy in place of O(dt^2),
 * and being symplectic it still conserves energy over long runs rather than
 * letting the planets spiral. Net cost against Verlet at a tenth-day step is
 * about 1.5x; the accuracy gain is four orders of magnitude.
 */
const CUBE_ROOT_TWO = Math.cbrt(2);
const OUTER_WEIGHT = 1 / (2 - CUBE_ROOT_TWO);
const INNER_WEIGHT = -CUBE_ROOT_TWO / (2 - CUBE_ROOT_TWO);

/** How often to retain a state snapshot, days. Bounds the cost of seeking. */
const CHECKPOINT_INTERVAL_DAYS = 365.25 * 5;

/**
 * Per-body corrections to the seed speed, as fractional adjustments.
 *
 * The reference ephemeris publishes *mean* elements — a smoothed fit, not an
 * instantaneous dynamical state. Handing them to an integrator gives each body
 * a slightly wrong orbital energy, and since a wrong energy means a wrong
 * period, the resulting phase error grows without bound: uncorrected, Jupiter
 * and Saturn were arriving at their 1623 great conjunction two months early.
 *
 * These factors are the classical fix — differential correction of the initial
 * conditions against observation, which is how real orbit determination works.
 * They were found by nulling the secular longitude drift measured symmetrically
 * either side of the epoch. `calibrateSeed` in `calibrate.ts` regenerates them;
 * it is a maintenance tool run by hand, not part of the suite, so these values
 * are guarded by the accuracy tests rather than by re-deriving them.
 */
const SEED_SPEED_CORRECTION: Partial<Record<BodyId, number>> = {
  mercury: 6.255441566527657e-8,
  venus: 0.00002740655516027884,
  earth: -0.0000017487843351790017,
  moon: -0.00009410551209203813,
  mars: -0.000025998230580093523,
  jupiter: 0.0003427075966180801,
  saturn: 0.0010333631555176053,
};

interface Snapshot {
  jd: number;
  positions: Float64Array;
  velocities: Float64Array;
}

/**
 * Seed states with the speed corrections applied. A planet's correction scales
 * its velocity relative to the Sun; the Moon's scales its velocity relative to
 * Earth, since what needs fixing there is its orbit about Earth.
 */
function correctedSeedStates(
  jd: number,
  correction: Partial<Record<BodyId, number>>,
): Map<BodyId, StateVector> {
  const states = keplerianStates(jd);

  for (const [id, factor] of Object.entries(correction) as [BodyId, number][]) {
    const state = states.get(id);
    if (!state) continue;

    const reference = id === 'moon' ? states.get('earth')!.velocity : ZERO;
    states.set(id, {
      position: state.position,
      velocity: add(reference, scale(sub(state.velocity, reference), 1 + factor)),
    });
  }

  return states;
}

/**
 * Velocity-Verlet n-body integrator over the nine modelled bodies.
 *
 * State is held in flat Float64Arrays rather than Vec3 objects: the inner loop
 * runs tens of millions of times over an 800-year span, and allocating three
 * objects per body per step dominates everything else.
 */
export class NBodySimulation {
  private readonly count = GRAVITATING_BODY_IDS.length;
  private readonly gm: Float64Array;
  private readonly stepDays: number;

  private positions: Float64Array;
  private velocities: Float64Array;
  private accelerations: Float64Array;
  private currentJd: number;

  /** Snapshots keyed by checkpoint index, so seeking never restarts from the epoch. */
  private readonly checkpoints = new Map<number, Snapshot>();

  private readonly speedCorrection: Partial<Record<BodyId, number>>;

  constructor(
    stepDays: number = DEFAULT_STEP_DAYS,
    speedCorrection: Partial<Record<BodyId, number>> = SEED_SPEED_CORRECTION,
  ) {
    this.stepDays = stepDays;
    this.speedCorrection = speedCorrection;
    this.gm = new Float64Array(this.count);
    for (let i = 0; i < this.count; i++) {
      this.gm[i] = BODIES[GRAVITATING_BODY_IDS[i]!].gm;
    }

    this.positions = new Float64Array(this.count * 3);
    this.velocities = new Float64Array(this.count * 3);
    this.accelerations = new Float64Array(this.count * 3);
    this.currentJd = J2000;

    this.seedFromKepler(J2000);
    this.storeCheckpoint();
  }

  /**
   * Set state from the reference ephemeris and shift into the barycentric
   * frame. Seeding heliocentrically would leave the system with net momentum,
   * sending the whole solar system drifting across the map.
   */
  private seedFromKepler(jd: number): void {
    const states = correctedSeedStates(jd, this.speedCorrection);

    let totalMass = 0;
    let cx = 0, cy = 0, cz = 0;
    let vx = 0, vy = 0, vz = 0;

    for (let i = 0; i < this.count; i++) {
      const state = states.get(GRAVITATING_BODY_IDS[i]!) as StateVector;
      const mass = this.gm[i]!;
      totalMass += mass;
      cx += mass * state.position.x;
      cy += mass * state.position.y;
      cz += mass * state.position.z;
      vx += mass * state.velocity.x;
      vy += mass * state.velocity.y;
      vz += mass * state.velocity.z;
    }

    cx /= totalMass; cy /= totalMass; cz /= totalMass;
    vx /= totalMass; vy /= totalMass; vz /= totalMass;

    for (let i = 0; i < this.count; i++) {
      const state = states.get(GRAVITATING_BODY_IDS[i]!) as StateVector;
      const base = i * 3;
      this.positions[base] = state.position.x - cx;
      this.positions[base + 1] = state.position.y - cy;
      this.positions[base + 2] = state.position.z - cz;
      this.velocities[base] = state.velocity.x - vx;
      this.velocities[base + 1] = state.velocity.y - vy;
      this.velocities[base + 2] = state.velocity.z - vz;
    }

    this.currentJd = jd;
    this.computeAccelerations(this.positions, this.accelerations);
  }

  private computeAccelerations(positions: Float64Array, out: Float64Array): void {
    out.fill(0);

    for (let i = 0; i < this.count; i++) {
      const bi = i * 3;
      for (let j = i + 1; j < this.count; j++) {
        const bj = j * 3;
        const dx = positions[bj]! - positions[bi]!;
        const dy = positions[bj + 1]! - positions[bi + 1]!;
        const dz = positions[bj + 2]! - positions[bi + 2]!;

        const distanceSquared = dx * dx + dy * dy + dz * dz;
        const inverseCube = 1 / (distanceSquared * Math.sqrt(distanceSquared));

        const pullOnI = this.gm[j]! * inverseCube;
        out[bi] = out[bi]! + dx * pullOnI;
        out[bi + 1] = out[bi + 1]! + dy * pullOnI;
        out[bi + 2] = out[bi + 2]! + dz * pullOnI;

        const pullOnJ = this.gm[i]! * inverseCube;
        out[bj] = out[bj]! - dx * pullOnJ;
        out[bj + 1] = out[bj + 1]! - dy * pullOnJ;
        out[bj + 2] = out[bj + 2]! - dz * pullOnJ;
      }
    }
  }

  private verletSubStep(dt: number): void {
    const half = 0.5 * dt;
    const { positions, velocities, accelerations } = this;

    for (let k = 0; k < positions.length; k++) {
      positions[k] = positions[k]! + velocities[k]! * dt + accelerations[k]! * half * dt;
      velocities[k] = velocities[k]! + accelerations[k]! * half;
    }

    this.computeAccelerations(positions, accelerations);

    for (let k = 0; k < velocities.length; k++) {
      velocities[k] = velocities[k]! + accelerations[k]! * half;
    }
  }

  private stepOnce(dt: number): void {
    this.verletSubStep(OUTER_WEIGHT * dt);
    this.verletSubStep(INNER_WEIGHT * dt);
    this.verletSubStep(OUTER_WEIGHT * dt);
    this.currentJd += dt;
  }

  private checkpointIndex(jd: number): number {
    return Math.floor((jd - J2000) / CHECKPOINT_INTERVAL_DAYS);
  }

  private storeCheckpoint(): void {
    const index = this.checkpointIndex(this.currentJd);
    if (this.checkpoints.has(index)) return;
    this.checkpoints.set(index, {
      jd: this.currentJd,
      positions: this.positions.slice(),
      velocities: this.velocities.slice(),
    });
  }

  private restore(snapshot: Snapshot): void {
    this.positions.set(snapshot.positions);
    this.velocities.set(snapshot.velocities);
    this.currentJd = snapshot.jd;
    this.computeAccelerations(this.positions, this.accelerations);
  }

  /** Nearest stored snapshot at or before the target, to integrate forward from. */
  private bestStartingPoint(targetJd: number): Snapshot | null {
    let best: Snapshot | null = null;
    for (const snapshot of this.checkpoints.values()) {
      const distance = Math.abs(snapshot.jd - targetJd);
      if (!best || distance < Math.abs(best.jd - targetJd)) best = snapshot;
    }
    return best;
  }

  /** Integrate to `targetJd`, reusing the nearest checkpoint. */
  advanceTo(targetJd: number): void {
    const target = Math.min(MAX_JD, Math.max(MIN_JD, targetJd));

    const candidate = this.bestStartingPoint(target);
    if (
      candidate &&
      Math.abs(candidate.jd - target) < Math.abs(this.currentJd - target)
    ) {
      this.restore(candidate);
    }

    // Verlet is time-reversible, so running backwards is just a negative step.
    const direction = target > this.currentJd ? 1 : -1;
    const dt = this.stepDays * direction;

    let lastCheckpointIndex = this.checkpointIndex(this.currentJd);

    while (Math.abs(target - this.currentJd) > 1e-9) {
      const remaining = Math.abs(target - this.currentJd);
      this.stepOnce(remaining < this.stepDays ? remaining * direction : dt);

      const index = this.checkpointIndex(this.currentJd);
      if (index !== lastCheckpointIndex) {
        this.storeCheckpoint();
        lastCheckpointIndex = index;
      }
    }
  }

  positionsAt(jd: number): Map<BodyId, Vec3> {
    this.advanceTo(jd);

    const result = new Map<BodyId, Vec3>();
    for (let i = 0; i < this.count; i++) {
      const base = i * 3;
      result.set(
        GRAVITATING_BODY_IDS[i]!,
        vec3(this.positions[base]!, this.positions[base + 1]!, this.positions[base + 2]!),
      );
    }

    /*
     * The moons are hung on afterwards rather than integrated, because a
     * quarter-day step gives Io seven of them per orbit and an orbit sampled
     * seven times does not close. Resolving it would need a step fifteen times
     * finer and, with fourteen bodies instead of nine, would turn a 370 ms seek
     * into something near fifteen seconds.
     *
     * This is not a dodge around the arithmetic. It is Newton's own treatment:
     * Principia Book III takes Jupiter's moons as a two-body problem, and that
     * is how he weighed Jupiter.
     */
    addSatellites(jd, result);
    return result;
  }

  /**
   * Positions and velocities together.
   *
   * Velocities are the integrator's own state, and no other engine has them: the
   * historical constructions give a position for a date and nothing more. That
   * is precisely why only this engine can show forces — the machinery Newton
   * places a body with is not a curve but a pair of vectors.
   */
  statesAt(jd: number): StateVectors {
    this.advanceTo(jd);

    const positions = new Map<BodyId, Vec3>();
    const velocities = new Map<BodyId, Vec3>();
    for (let i = 0; i < this.count; i++) {
      const base = i * 3;
      const id = GRAVITATING_BODY_IDS[i]!;
      positions.set(
        id,
        vec3(this.positions[base]!, this.positions[base + 1]!, this.positions[base + 2]!),
      );
      velocities.set(
        id,
        vec3(
          this.velocities[base]!,
          this.velocities[base + 1]!,
          this.velocities[base + 2]!,
        ),
      );
    }
    return { positions, velocities };
  }

  /**
   * Total energy in the barycentric frame. Constant to within integrator error,
   * which makes it the cheapest available check that a long run has not gone
   * numerically bad.
   */
  totalEnergy(): number {
    let kinetic = 0;
    let potential = 0;

    for (let i = 0; i < this.count; i++) {
      const base = i * 3;
      const speedSquared =
        this.velocities[base]! ** 2 +
        this.velocities[base + 1]! ** 2 +
        this.velocities[base + 2]! ** 2;
      kinetic += 0.5 * this.gm[i]! * speedSquared;

      for (let j = i + 1; j < this.count; j++) {
        const other = j * 3;
        const dx = this.positions[other]! - this.positions[base]!;
        const dy = this.positions[other + 1]! - this.positions[base + 1]!;
        const dz = this.positions[other + 2]! - this.positions[base + 2]!;
        potential -= (this.gm[i]! * this.gm[j]!) / Math.sqrt(dx * dx + dy * dy + dz * dz);
      }
    }

    return kinetic + potential;
  }

  get julianDate(): number {
    return this.currentJd;
  }
}

let shared: NBodySimulation | null = null;

/** Lazily created shared simulation — building one integrates from J2000. */
export const sharedSimulation = (): NBodySimulation => {
  shared ??= new NBodySimulation();
  return shared;
};

/** Velocity and every gravitational pull acting on one body. */
export const nbodyDynamics = (jd: number, target: BodyId): Dynamics | null =>
  dynamicsOf(sharedSimulation().statesAt(jd), target);

export const nbodyEngine: Engine = {
  id: 'nbody',
  positionsAt: (jd: number): PositionSet => sharedSimulation().positionsAt(jd),
  dynamics: nbodyDynamics,
};

/** Heliocentric view of an n-body result, for comparison against the other
 *  engines, which are all Sun-centred. */
export function toHeliocentric(positions: Map<BodyId, Vec3>): Map<BodyId, Vec3> {
  const sun = positions.get('sun')!;
  const result = new Map<BodyId, Vec3>();
  for (const [id, position] of positions) {
    result.set(id, sub(position, sun));
  }
  return result;
}
