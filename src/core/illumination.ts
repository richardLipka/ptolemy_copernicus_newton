/**
 * Phases.
 *
 * The lit fraction of a body depends only on the real Sun-body-observer
 * geometry, so it is computed from true positions and never from the display
 * frame. Recentring the map on Jupiter must not change the Moon's phase.
 *
 * Phases are computed from whichever engine is active, so each model answers for
 * itself. What they disagree about is only the Sun-body-observer triangle, and
 * the historical constructions were fitted to get that roughly right, so the
 * disagreements are smaller than one might expect — see
 * `illumination.test.ts`, which pins down the actual figures.
 *
 * In particular, switching to the epicyclic engine does *not* turn Venus into a
 * permanent crescent. Ptolemy's construction fixes angles, not distances, and
 * his own epicycle ratio lets Venus reach the far side of its epicycle and show
 * a full disc. What forbade a full Venus was the nested-sphere cosmology built
 * around the construction, which this engine does not model. See CLAUDE.md
 * §12.4 and `venus-phases.test.ts`.
 */

import type { BodyId } from './bodies';
import { BODIES } from './bodies';
import type { PositionSet } from './engines/types';
import { angleDiffDeg, dot, length, sub } from './vec';
import { apparentLongitude } from './coordinates';

export interface Illumination {
  /** Sun-body-observer angle, degrees. Zero is full, 180 is new. */
  phaseAngle: number;
  /** Lit fraction of the visible disc, 0 to 1. */
  illuminatedFraction: number;
  /** True when the lit limb leads the body eastward, as a waxing Moon's does. */
  waxing: boolean;
  /** Apparent angular diameter seen from the observer, arcseconds. */
  angularDiameter: number;
}

const AU_IN_KM = 149_597_870.7;

export function illuminationOf(
  positions: PositionSet,
  observer: BodyId,
  target: BodyId,
): Illumination {
  const observerPosition = positions.get(observer)!;
  const targetPosition = positions.get(target)!;
  const sunPosition = positions.get('sun')!;

  const toSun = sub(sunPosition, targetPosition);
  const toObserver = sub(observerPosition, targetPosition);

  const distanceToObserver = length(toObserver);
  const denominator = length(toSun) * distanceToObserver;

  const phaseAngle =
    denominator === 0
      ? 0
      : Math.acos(Math.min(1, Math.max(-1, dot(toSun, toObserver) / denominator))) *
        (180 / Math.PI);

  // The lit limb faces the Sun, so which side it appears on follows from
  // whether the body sits east or west of the Sun in the observer's sky.
  const elongation = angleDiffDeg(
    apparentLongitude(positions, observer, target),
    apparentLongitude(positions, observer, 'sun'),
  );

  const radiusKm = BODIES[target].radius;
  const distanceKm = distanceToObserver * AU_IN_KM;

  return {
    phaseAngle,
    illuminatedFraction: (1 + Math.cos((phaseAngle * Math.PI) / 180)) / 2,
    waxing: elongation > 0,
    angularDiameter:
      distanceKm === 0 ? 0 : 2 * Math.atan(radiusKm / distanceKm) * (180 / Math.PI) * 3600,
  };
}

export type PhaseName =
  | 'new'
  | 'waxing-crescent'
  | 'first-quarter'
  | 'waxing-gibbous'
  | 'full'
  | 'waning-gibbous'
  | 'last-quarter'
  | 'waning-crescent';

/** Classify a phase for display. Thresholds follow the usual lunar convention. */
export function phaseName(illumination: Illumination): PhaseName {
  const { illuminatedFraction: lit, waxing } = illumination;

  if (lit < 0.02) return 'new';
  if (lit > 0.98) return 'full';
  if (Math.abs(lit - 0.5) < 0.02) return waxing ? 'first-quarter' : 'last-quarter';

  if (lit < 0.5) return waxing ? 'waxing-crescent' : 'waning-crescent';
  return waxing ? 'waxing-gibbous' : 'waning-gibbous';
}
