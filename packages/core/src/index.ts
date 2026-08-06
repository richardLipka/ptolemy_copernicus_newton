/**
 * `@orrery/core` — the solar system, and four ways of accounting for it.
 *
 * This entry point carries the things nearly every consumer needs: the body
 * table, time conversion, vector arithmetic, the engine registry and the shared
 * types. It is deliberately *not* everything.
 *
 * **Every module is importable on its own**, which is the point of the package:
 * a tool that only wants Kepler should not be made to load the VSOP87 tables and
 * the n-body integrator to get him.
 *
 * ```ts
 * import { BODIES, jdFromCalendar } from '@orrery/core';
 * import { keplerianPositions } from '@orrery/core/engines/keplerian';
 * import { ptolemaicGeometryFor } from '@orrery/core/engines/ptolemaic';
 * import { buildLongitudeTrack } from '@orrery/core/longitudeTrack';
 * ```
 *
 * The subpath mirrors the file path, and `sideEffects: false` lets a bundler
 * drop whatever is not reached. Importing `@orrery/core/engines/registry` — or
 * `ENGINES` from here — is what pulls all eight in at once.
 *
 * Names are re-exported explicitly rather than with `export *`, because several
 * modules export words as general as `length` and `locate` that have no business
 * in a package's top-level namespace.
 */

// --- the solar system ----------------------------------------------------

export {
  BODIES,
  BODY_IDS,
  ORBITING_BODY_IDS,
  GRAVITATING_BODY_IDS,
  SATELLITE_IDS,
  AU_IN_KM,
  GM_SUN,
  MOON_TO_EMB_MASS_FRACTION,
} from './bodies.js';
export type {
  Body,
  BodyId,
  KeplerianElements,
  LocalizedName,
  OrbitalModel,
  SatelliteOrbit,
} from './bodies.js';

// --- time ----------------------------------------------------------------

export {
  J2000,
  DAYS_PER_JULIAN_CENTURY,
  MIN_JD,
  MAX_JD,
  SimulationClock,
  calendarFromJd,
  centuriesSinceJ2000,
  clampJd,
  dateFromJd,
  jdFromCalendar,
  jdFromDate,
} from './time.js';
export type { CalendarDate } from './time.js';

// --- geometry ------------------------------------------------------------

export { DEG, RAD, ZERO, add, angleDiffDeg, cross, dot, normalizeDeg, scale, sub, vec3 } from './vec.js';
export type { Vec3 } from './vec.js';

export { apparentLongitude, apparentLongitudeRate, relativePosition, solarElongation, toSpherical } from './coordinates.js';
export type { SphericalPosition } from './coordinates.js';

export { recenter } from './frame.js';

// --- the models ----------------------------------------------------------

export { ENGINES, REFERENCE_ENGINE_ID, engineFor } from './engines/registry.js';
export { MODES } from './engines/types.js';
export type { Engine, EngineId, Mode, ModeId, PositionSet, StateVector } from './engines/types.js';

export type {
  Construction,
  ConstructionArm,
  ConstructionCircle,
  ConstructionEllipse,
  ConstructionMarker,
  ConstructionRole,
  ConstructionSource,
} from './construction.js';
