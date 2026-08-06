/**
 * Differential correction of the n-body seed state.
 *
 * Handing an integrator the reference ephemeris's mean elements gives each
 * body a slightly wrong orbital energy, and a wrong energy is a wrong period,
 * so the phase error grows without bound. This routine measures that secular
 * drift and solves for the speed adjustment that nulls it — the same procedure
 * used to fit a real orbit to observations.
 *
 * It is a development tool, not something the app runs: the output is a small
 * table of constants that gets pasted into `nbody.ts`.
 */

import { BODIES, type BodyId } from '../bodies.js';
import { apparentLongitude, toSpherical } from '../coordinates.js';
import { J2000 } from '../time.js';
import { DEG, angleDiffDeg, sub } from '../vec.js';
import { keplerianPositions } from './keplerian.js';
import { NBodySimulation } from './nbody.js';

const CALIBRATED_BODIES: readonly BodyId[] = [
  'mercury',
  'venus',
  'earth',
  'moon',
  'mars',
  'jupiter',
  'saturn',
];

/** Mean motion about the primary, radians per day. */
function meanMotion(id: BodyId): number {
  if (id === 'moon') return (2 * Math.PI) / 27.321661;
  return (BODIES[id].orbit!.rates.L * DEG) / 36525;
}

/**
 * Longitude error against the reference. Planets are measured heliocentrically
 * and the Moon geocentrically, so that each body's error reflects its own orbit
 * rather than its primary's.
 */
function longitudeError(sim: NBodySimulation, jd: number, id: BodyId): number {
  const modelled = sim.positionsAt(jd);
  const truth = keplerianPositions(jd);

  if (id === 'moon') {
    return angleDiffDeg(
      apparentLongitude(modelled, 'earth', 'moon'),
      apparentLongitude(truth, 'earth', 'moon'),
    );
  }

  const modelledHeliocentric = toSpherical(
    sub(modelled.get(id)!, modelled.get('sun')!),
  ).longitude;
  const truthHeliocentric = toSpherical(truth.get(id)!).longitude;
  return angleDiffDeg(modelledHeliocentric, truthHeliocentric);
}

export interface CalibrationResult {
  corrections: Record<string, number>;
  worstResidualDeg: Record<string, number>;
}

const YEAR = 365.25;

/**
 * Baselines to fit over, shortest first.
 *
 * Longitude error is only measurable modulo a full turn, so a baseline long
 * enough for the drift to exceed 180 degrees reports nonsense. The Moon laps
 * its orbit 2,700 times in two centuries and starts far enough off to wrap
 * many times over. Fitting a short baseline first pulls it close enough that
 * the next one is unambiguous, and so on outwards.
 */
const BASELINE_SCHEDULE = [YEAR * 4, YEAR * 20, YEAR * 60, YEAR * 200];

/**
 * Iteratively refine the seed speeds.
 *
 * The drift is measured symmetrically about the epoch: a secular error changes
 * sign either side of it while periodic terms do not, so differencing the two
 * isolates the part that actually needs correcting.
 */
export function calibrateSeed(
  schedule: readonly number[] = BASELINE_SCHEDULE,
  iterationsPerBaseline = 3,
): CalibrationResult {
  const corrections: Partial<Record<BodyId, number>> = {};

  for (const baselineDays of schedule) {
    for (let pass = 0; pass < iterationsPerBaseline; pass++) {
      const sim = new NBodySimulation(undefined, { ...corrections });

      for (const id of CALIBRATED_BODIES) {
        const ahead = longitudeError(sim, J2000 + baselineDays, id);
        const behind = longitudeError(sim, J2000 - baselineDays, id);

        const secularRateDegPerDay = (ahead - behind) / (2 * baselineDays);
        // A fractional speed change dv/v shifts the mean motion by -3 dv/v, so
        // a model running ahead needs its speed increased to slow it down.
        const adjustment = (secularRateDegPerDay * DEG) / (3 * meanMotion(id));

        corrections[id] = (corrections[id] ?? 0) + adjustment;
      }
    }
  }

  const longest = schedule[schedule.length - 1]!;
  const sim = new NBodySimulation(undefined, { ...corrections });
  const worstResidualDeg: Record<string, number> = {};
  for (const id of CALIBRATED_BODIES) {
    let worst = 0;
    for (const fraction of [-1, -0.5, -0.25, 0.25, 0.5, 1]) {
      worst = Math.max(
        worst,
        Math.abs(longitudeError(sim, J2000 + longest * fraction, id)),
      );
    }
    worstResidualDeg[id] = worst;
  }

  return { corrections: { ...corrections } as Record<string, number>, worstResidualDeg };
}
