/**
 * Every engine, by id.
 *
 * This lived in the app's store until the split, which made it awkward to reach
 * for from anywhere else: a tool that wants to run all eight models over one
 * date range has no business constructing a UI state container to do it.
 *
 * **Importing this module pulls in all eight engines**, including the VSOP87
 * tables and the n-body integrator. That is the right trade for a consumer that
 * genuinely wants the set — the app's model comparison, an error-vs-time study —
 * but it is the wrong one for a consumer that wants a single model. Those should
 * import the engine's own module instead:
 *
 * ```ts
 * import { keplerianEngine } from '@orrery/core/engines/keplerian';
 * ```
 *
 * The package sets `sideEffects: false`, so a bundler drops whatever such a
 * consumer does not reach.
 */

import { circularEngine } from './circular.js';
import { copernicanEngine } from './copernican.js';
import { keplerianEngine } from './keplerian.js';
import { nbodyEngine } from './nbody.js';
import {
  ptolemaicAlmagestEngine,
  ptolemaicEpicyclicEngine,
  ptolemaicReframeEngine,
} from './ptolemaic.js';
import { vsop87Engine } from './vsop87.js';
import type { Engine, EngineId } from './types.js';

export const ENGINES: Record<EngineId, Engine> = {
  keplerian: keplerianEngine,
  vsop87: vsop87Engine,
  circular: circularEngine,
  copernican: copernicanEngine,
  'ptolemaic-reframe': ptolemaicReframeEngine,
  'ptolemaic-epicyclic': ptolemaicEpicyclicEngine,
  'ptolemaic-almagest': ptolemaicAlmagestEngine,
  nbody: nbodyEngine,
};

/** The reference ephemeris every other model is measured against. */
export const REFERENCE_ENGINE_ID: EngineId = 'vsop87';

export const engineFor = (id: EngineId): Engine => ENGINES[id];
