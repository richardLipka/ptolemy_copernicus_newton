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

import type { BodyId } from './bodies.js';
import type { EngineId } from './engines/types.js';
import type { Vec3 } from './vec.js';

export type ConstructionRole =
  /** The main circle: Ptolemy's deferent, or a Copernican orbit. */
  | 'deferent'
  /** The small circle the body itself rides on. */
  | 'epicycle'
  /** Kepler's ellipse. Not a circle, and drawn so it cannot be mistaken for one. */
  | 'orbit'
  /** Centre of the main circle, displaced from the observer when eccentric. */
  | 'centre'
  /**
   * A focus of Kepler's ellipse. Two are drawn: the Sun sits on one and nothing
   * whatever sits on the other, which is the whole content of the first law and
   * is invisible unless both are marked.
   */
  | 'focus'
  /** The point about which motion is uniform. Ptolemy's real innovation. */
  | 'equant'
  /** Arm carrying the epicycle's centre round the deferent. */
  | 'deferent-arm'
  /** Arm from the epicycle's centre out to the body. */
  | 'epicycle-arm'
  /** Focus to body: the radius vector, whose sweep is Kepler's second law. */
  | 'radius'
  /** Line of apsides — the axis the eccentricity is measured along. */
  | 'apsidal';

export interface ConstructionCircle {
  centre: Vec3;
  radius: number;
  role: ConstructionRole;
}

/**
 * An ellipse, given by its centre and its two semi-axes as *vectors*.
 *
 * Vectors rather than lengths-and-an-angle because the orbit is tilted out of
 * the ecliptic, and an angle would need a plane to be measured in — forcing
 * every consumer to agree on a convention. Two axis vectors carry the
 * orientation, the tilt and both lengths at once, and sampling reduces to
 * `centre + major·cos θ + minor·sin θ` with no trigonometric bookkeeping.
 */
export interface ConstructionEllipse {
  /** Geometric centre — emphatically *not* the focus the Sun occupies. */
  centre: Vec3;
  /** Centre to perihelion: direction and semi-major length in one. */
  majorAxis: Vec3;
  /** Centre along the semi-minor axis, perpendicular to `majorAxis`. */
  minorAxis: Vec3;
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
  /**
   * Optional because only Kepler has any: the geometric models that preceded
   * him are built from circles by construction, which is the point of the
   * comparison.
   */
  ellipses?: ConstructionEllipse[];
  arms: ConstructionArm[];
  markers: ConstructionMarker[];
}

/** Engines that draw a body by construction rather than by formula. */
export type ConstructionSource = (jd: number, bodyId: BodyId) => Construction | null;

/**
 * Which family of machinery an engine draws with.
 *
 * A consumer that wants to *say* something about a construction — label it,
 * explain it, choose the word "deferent" over "orbit" — needs to know whose
 * machinery it is looking at, and the roles alone will not tell it: a circle
 * marked `deferent` means one thing carrying an epicycle round the Earth and
 * quite another as Copernicus's eccentric about the Sun.
 *
 * `ptolemaic-reframe` is grouped with the plain circle deliberately: it is
 * modern positions in geocentric dress and exposes no construction of its own
 * for the planets either, so inventing an equant for it would be a fiction about
 * a mode whose whole point is that it has no machinery.
 */
export type ConstructionFamily =
  | 'ptolemaic'
  | 'copernican'
  | 'kepler'
  | 'newton'
  | 'circle';

export function constructionFamilyOf(engineId: EngineId): ConstructionFamily {
  if (engineId === 'ptolemaic-epicyclic' || engineId === 'ptolemaic-almagest') {
    return 'ptolemaic';
  }
  if (engineId === 'copernican') return 'copernican';
  if (engineId === 'keplerian') return 'kepler';
  if (engineId === 'nbody') return 'newton';
  return 'circle';
}
