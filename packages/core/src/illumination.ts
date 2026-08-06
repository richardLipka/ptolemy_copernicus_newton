/**
 * Phases.
 *
 * The lit fraction of a body depends only on the real Sun-body-observer
 * geometry, so it is computed from true positions and never from the display
 * frame. Recentring the map on Jupiter must not change the Moon's phase.
 *
 * Phases are computed from whichever engine is active, so each model answers for
 * itself — and this is the one measurement where the geocentric model fails
 * completely rather than merely imprecisely.
 *
 * Ptolemy's deferents are scaled to his nested spheres, so Venus is penned
 * inside the Sun's shell and can never turn more than half its lit face toward
 * Earth. At superior conjunction the model therefore says crescent where the sky
 * says full, which is exactly what Galileo's telescope refuted. Longitude and
 * phase rank the models in opposite orders: see `accuracy.test.ts` for the one
 * and `illumination.test.ts` for the other.
 */

import type { BodyId } from './bodies.js';
import { BODIES } from './bodies.js';
import type { PositionSet } from './engines/types.js';
import { angleDiffDeg, dot, length, sub } from './vec.js';
import { apparentLongitude } from './coordinates.js';

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
