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
import type { Engine, EngineId, PositionSet } from './types.js';

/**
 * Small bounded per-engine cache keyed by exact Julian Date.
 *
 * One animation frame touches the same `jd` repeatedly — trail logging,
 * plan-view projection, harness construction, split-view pane, sky band, and
 * inspector readouts all ask `ENGINES[id].positionsAt(jd)` for the identical
 * instant. Retaining the last 16 snapshots per engine eliminates redundant
 * trigonometric/VSOP87/integrator evaluations while bounding memory tightly.
 */
function withPositionCache(engine: Engine, capacity = 16): Engine {
  const cache = new Map<number, PositionSet>();
  return {
    ...engine,
    positionsAt(jd: number): PositionSet {
      const cached = cache.get(jd);
      if (cached !== undefined) return cached;
      const computed = engine.positionsAt(jd);
      if (cache.size >= capacity) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(jd, computed);
      return computed;
    },
  };
}

export const ENGINES: Record<EngineId, Engine> = {
  keplerian: withPositionCache(keplerianEngine),
  vsop87: withPositionCache(vsop87Engine),
  circular: withPositionCache(circularEngine),
  copernican: withPositionCache(copernicanEngine),
  'ptolemaic-reframe': withPositionCache(ptolemaicReframeEngine),
  'ptolemaic-epicyclic': withPositionCache(ptolemaicEpicyclicEngine),
  'ptolemaic-almagest': withPositionCache(ptolemaicAlmagestEngine),
  nbody: withPositionCache(nbodyEngine),
};

/** The reference ephemeris every other model is measured against. */
export const REFERENCE_ENGINE_ID: EngineId = 'vsop87';

export const engineFor = (id: EngineId): Engine => ENGINES[id];
