import type { BodyId } from '../bodies';
import type { ConstructionSource } from '../construction';
import type { Vec3 } from '../vec';

/**
 * Positions of every modelled body at one instant, in the ecliptic plane,
 * units of AU.
 *
 * The *origin* of this frame is engine-defined and deliberately unspecified:
 * the Keplerian, circular, and n-body engines produce Sun-centred coordinates,
 * while the epicyclic Ptolemaic engine produces Earth-centred ones. This is
 * safe because everything downstream — recentring, apparent longitudes,
 * illumination, events — consumes only *differences* between bodies. Any code
 * that treats a raw coordinate as absolute is a bug.
 */
export type PositionSet = ReadonlyMap<BodyId, Vec3>;

export interface StateVector {
  position: Vec3;
  /** AU per day. */
  velocity: Vec3;
}

export interface Engine {
  readonly id: EngineId;
  positionsAt(jd: number): PositionSet;
  /**
   * The machinery this engine uses to place a body, where it has any.
   *
   * Present only for engines that construct a position geometrically — the
   * Ptolemaic epicycles and the Copernican circles. The n-body integrator has
   * no construction to show, and the Earth-centred reframe borrows accurate
   * positions rather than deriving them, so both leave this undefined.
   */
  construction?: ConstructionSource;
}

export type EngineId =
  | 'keplerian'
  | 'circular'
  | 'ptolemaic-reframe'
  | 'ptolemaic-epicyclic'
  | 'nbody';

export type ModeId = 'ptolemy' | 'copernicus' | 'newton';

export interface Mode {
  id: ModeId;
  /** Engine ids selectable within this mode; the first is the default. */
  engines: readonly EngineId[];
  defaultFrameOrigin: BodyId;
  defaultObservationPoint: BodyId;
}

export const MODES: Record<ModeId, Mode> = {
  ptolemy: {
    id: 'ptolemy',
    // The authentic construction leads: a mode called "Ptolemy" should open
    // showing deferents, epicycles and the equant, which is also the only
    // sub-mode with machinery to display. The Earth-centred reframe is the
    // analytical companion to it, one selection away.
    engines: ['ptolemaic-epicyclic', 'ptolemaic-reframe'],
    defaultFrameOrigin: 'earth',
    defaultObservationPoint: 'earth',
  },
  copernicus: {
    id: 'copernicus',
    engines: ['circular'],
    defaultFrameOrigin: 'sun',
    defaultObservationPoint: 'earth',
  },
  newton: {
    id: 'newton',
    engines: ['nbody'],
    defaultFrameOrigin: 'sun',
    defaultObservationPoint: 'earth',
  },
};
