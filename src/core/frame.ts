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

import type { BodyId } from './bodies';
import type { PositionSet } from './engines/types';
import { sub, type Vec3 } from './vec';

export function recenter(positions: PositionSet, originId: BodyId): Map<BodyId, Vec3> {
  const origin = positions.get(originId);
  if (!origin) throw new Error(`Cannot centre on unknown body "${originId}"`);

  const result = new Map<BodyId, Vec3>();
  for (const [id, position] of positions) {
    result.set(id, sub(position, origin));
  }
  return result;
}

/**
 * Trace the path a body draws when the map is held fixed on `originId`.
 *
 * Around the Sun these are the familiar ellipses. Around Earth they are the
 * looping, petalled curves that cost Ptolemy his epicycles — and the loops are
 * real, in the sense that they are what the motion genuinely looks like from
 * here. The curve is not a trajectory through space; it is a trajectory
 * through a rotating point of view.
 */
export function orbitPath(
  positionsAt: (jd: number) => PositionSet,
  bodyId: BodyId,
  originId: BodyId,
  startJd: number,
  endJd: number,
  samples: number,
): Vec3[] {
  const path: Vec3[] = [];
  const step = (endJd - startJd) / Math.max(1, samples - 1);

  for (let i = 0; i < samples; i++) {
    const positions = positionsAt(startJd + step * i);
    path.push(sub(positions.get(bodyId)!, positions.get(originId)!));
  }

  return path;
}
