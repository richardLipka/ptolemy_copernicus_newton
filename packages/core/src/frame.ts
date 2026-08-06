/**
 * Choice of stationary point.
 *
 * This is the whole Ptolemy-versus-Copernicus argument reduced to one
 * subtraction. Neither astronomer disagreed about the relative geometry of the
 * solar system as it appears from Earth; they disagreed about which body to
 * hold still. Because every engine's output is consumed as differences, moving
 * the origin changes what the map looks like without changing a single
 * observable — which is exactly the point the app is trying to make.
 */

import type { BodyId } from './bodies.js';
import type { PositionSet } from './engines/types.js';
import { sub, type Vec3 } from './vec.js';

export function recenter(positions: PositionSet, originId: BodyId): Map<BodyId, Vec3> {
  const origin = positions.get(originId);
  if (!origin) throw new Error(`Cannot centre on unknown body "${originId}"`);

  const result = new Map<BodyId, Vec3>();
  for (const [id, position] of positions) {
    result.set(id, sub(position, origin));
  }
  return result;
}

/*
 * There is deliberately no `orbitPath()` here.
 *
 * One existed — sample an engine across a date range and return the curve — and
 * it went unused from the moment trails were switched to position logs, because
 * a pre-computed path can show a shape the simulation never actually produced.
 * That is the one thing the orbit display is meant to make impossible (see
 * CLAUDE.md §13.2), so the function was removed rather than left lying about
 * for someone to find and reach for.
 */
