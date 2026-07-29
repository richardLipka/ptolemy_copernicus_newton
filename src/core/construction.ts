/**
 * The machinery a model uses to place a body — the scaffolding rather than the
 * result.
 *
 * A traced path shows *where* a planet goes. It says nothing about how the
 * model got it there, and for the Ptolemaic system that is most of the
 * interest: the deferent, the epicycle riding on it, and above all the equant,
 * the off-centre point about which the epicycle's centre sweeps equal angles in
 * equal times. The equant is the cleverest device in the Almagest and it is
 * completely invisible in the finished orbit.
 *
 * Geometry is expressed in the engine's own coordinate space, using the same
 * arbitrary origin its positions use, so the view layer can recentre and
 * project it exactly as it does everything else.
 */

import type { BodyId } from './bodies';
import type { Vec3 } from './vec';

export type ConstructionRole =
  /** The main circle: Ptolemy's deferent, or a Copernican orbit. */
  | 'deferent'
  /** The small circle the body itself rides on. */
  | 'epicycle'
  /** Centre of the main circle, displaced from the observer when eccentric. */
  | 'centre'
  /** The point about which motion is uniform. Ptolemy's real innovation. */
  | 'equant'
  /** Arm carrying the epicycle's centre round the deferent. */
  | 'deferent-arm'
  /** Arm from the epicycle's centre out to the body. */
  | 'epicycle-arm'
  /** Line of apsides — the axis the eccentricity is measured along. */
  | 'apsidal';

export interface ConstructionCircle {
  centre: Vec3;
  radius: number;
  role: ConstructionRole;
}

export interface ConstructionArm {
  from: Vec3;
  to: Vec3;
  role: ConstructionRole;
}

export interface ConstructionMarker {
  at: Vec3;
  role: ConstructionRole;
}

export interface Construction {
  circles: ConstructionCircle[];
  arms: ConstructionArm[];
  markers: ConstructionMarker[];
}

/** Engines that draw a body by construction rather than by formula. */
export type ConstructionSource = (jd: number, bodyId: BodyId) => Construction | null;

export const emptyConstruction = (): Construction => ({
  circles: [],
  arms: [],
  markers: [],
});
