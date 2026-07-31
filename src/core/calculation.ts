/**
 * What it *cost* to find out where a planet was.
 *
 * The rest of the app shows the four models as pictures. None of them was a
 * picture. Each was a calculating procedure that turned a date into a number,
 * and the numbers were the product: the *Almagest* is a book of tables, the
 * Alfonsine Tables ran European astronomy for three centuries, and Kepler spent
 * the better part of thirty years on the *Rudolphine Tables* — the ellipse was
 * how he got there, not what he was selling.
 *
 * This module reproduces each model's actual working for one body on one date,
 * step by step, in the order an astronomer would have carried it out. The point
 * it makes is uncomfortable and true: **the models get better and more expensive
 * in the same order**. Ptolemy needs two table look-ups and two additions.
 * Kepler needs a transcendental equation solved by iteration, per body, per
 * date, by hand. Newton needs an integration that cannot be done by hand at all.
 *
 * Every figure here is pulled from the engines themselves rather than recomputed
 * for display, so the panel cannot drift away from what the map is drawing.
 */

import { BODIES, type BodyId } from './bodies';
import { apparentLongitude } from './coordinates';
import { circularHeliocentricAt, circularPositions } from './engines/circular';
import {
  elementsAt,
  keplerianPositions,
  meanAnomalyAt,
  solveKeplerTraced,
} from './engines/keplerian';
import { nbodyEngine } from './engines/nbody';
import { ptolemaicEpicyclicPositions, ptolemaicGeometryFor } from './engines/ptolemaic';
import type { EngineId } from './engines/types';
import { J2000 } from './time';
import { normalizeDeg } from './vec';

/**
 * How a value should read once it reaches a reader.
 *
 * The magnitudes stay raw here and are formatted by the view, because "141.500"
 * and "141,500" are the same number and which one is correct depends on who is
 * looking. Doing it in this module would have hard-coded a decimal point into
 * the one panel in the app that is nothing but numbers.
 */
export type CalculationUnit =
  | 'degrees'
  /** Signed, for a correction term — the sign is the whole point. */
  | 'signedDegrees'
  | 'au'
  | 'ratio'
  | 'days'
  | 'count'
  /** No value at all, for the line that says Newton has no formula. */
  | 'none';

/** One line of working. */
export interface CalculationLine {
  /** i18n key for what this quantity is. */
  labelKey: string;
  /**
   * Symbolic form, e.g. `M = L − ϖ`. Deliberately not localised: this is
   * notation, and an astronomer of any language would recognise it.
   */
  formula?: string;
  /** Raw magnitude, already reduced to its natural range. */
  value: number | null;
  unit: CalculationUnit;
  /** Set on the line that is the answer, so the view can mark it. */
  isResult?: boolean;
}

export interface ModelCalculation {
  engineId: EngineId;
  lines: CalculationLine[];
  /** i18n key summarising the labour, and its raw substitutions. */
  costKey: string;
  costValues?: Record<string, number>;
}

/** Reduce a correction to (−180, 180], where its sign means something. */
const asCorrection = (value: number): number => (((value % 360) + 540) % 360) - 180;

/** Ecliptic longitude of a vector, degrees. */
const longitudeOf = (v: { x: number; y: number }): number =>
  normalizeDeg((Math.atan2(v.y, v.x) * 180) / Math.PI);

/**
 * Ptolemy: mean motion, then two corrections read from tables.
 *
 * This is the form every pre-Keplerian ephemeris took — *true = mean + equation
 * of centre + equation of argument* — and both equations were tabulated against
 * their argument so the working was addition and nothing worse. The equation of
 * centre is the equant's doing; the equation of argument is the epicycle's.
 */
function ptolemaicCalculation(jd: number, body: BodyId, observer: BodyId): ModelCalculation {
  const lines: CalculationLine[] = [];
  const geometry = ptolemaicGeometryFor(jd, body);

  if (geometry) {
    const meanLongitude = longitudeOf(geometry.epicycleCentre);
    const trueLongitude = longitudeOf(geometry.position);

    lines.push(
      {
        labelKey: 'calc.ptolemy.apogee',
        formula: 'A',
        value: normalizeDeg(geometry.apogee),
        unit: 'degrees',
      },
      {
        labelKey: 'calc.ptolemy.epicycleCentre',
        formula: 'λ̄',
        value: normalizeDeg(meanLongitude),
        unit: 'degrees',
      },
      {
        labelKey: 'calc.ptolemy.equationOfCentre',
        formula: 'λ̄ − A',
        value: asCorrection(meanLongitude - geometry.apogee),
        unit: 'signedDegrees',
      },
      {
        labelKey: 'calc.ptolemy.epicycleRadius',
        formula: 'r / R',
        value: geometry.deferentRadius
          ? geometry.epicycleRadius / geometry.deferentRadius
          : null,
        unit: 'ratio',
      },
      {
        labelKey: 'calc.ptolemy.equationOfArgument',
        formula: 'λ − λ̄',
        value: asCorrection(trueLongitude - meanLongitude),
        unit: 'signedDegrees',
      },
    );
  }

  lines.push({
    labelKey: 'calc.apparentLongitude',
    formula: 'λ',
    value: normalizeDeg(apparentLongitude(ptolemaicEpicyclicPositions(jd), observer, body)),
    unit: 'degrees',
    isResult: true,
  });

  return {
    engineId: 'ptolemaic-epicyclic',
    lines,
    costKey: geometry?.equant ? 'calc.cost.ptolemy' : 'calc.cost.ptolemySun',
  };
}

/**
 * Copernicus: a mean longitude, and no correction whatever.
 *
 * The cheapest of the four to work by hand, and the least accurate — which is
 * the whole difficulty of 1543. Anyone comparing the labour rather than the
 * philosophy had little reason to switch.
 */
function circularCalculation(jd: number, body: BodyId, observer: BodyId): ModelCalculation {
  const lines: CalculationLine[] = [];
  const orbit = BODIES[body].orbit;

  if (orbit) {
    const el = elementsAt(jd, orbit);
    lines.push(
      {
        labelKey: 'calc.meanLongitude',
        formula: 'L',
        value: normalizeDeg(el.L),
        unit: 'degrees',
      },
      { labelKey: 'calc.copernicus.radius', formula: 'a', value: el.a, unit: 'au' },
      {
        labelKey: 'calc.copernicus.heliocentric',
        formula: 'λ☉',
        value: longitudeOf(circularHeliocentricAt(jd, orbit)),
        unit: 'degrees',
      },
    );
  }

  lines.push({
    labelKey: 'calc.apparentLongitude',
    formula: 'λ',
    value: normalizeDeg(apparentLongitude(circularPositions(jd), observer, body)),
    unit: 'degrees',
    isResult: true,
  });

  return { engineId: 'circular', lines, costKey: 'calc.cost.copernicus' };
}

/**
 * Kepler: the same arrangement, and a wall.
 *
 * `M = E − e sin E` cannot be rearranged for E. Kepler knew it, said so, and
 * solved it by successive approximation anyway — once per body, per date. The
 * iteration count on this line is the price of the accuracy the model buys, and
 * it is why the *Rudolphine Tables* took decades where the Alfonsine Tables took
 * arithmetic.
 */
function keplerianCalculation(jd: number, body: BodyId, observer: BodyId): ModelCalculation {
  const lines: CalculationLine[] = [];
  const orbit = BODIES[body].orbit;
  let iterations = 0;

  if (orbit) {
    const el = elementsAt(jd, orbit);
    const meanAnomaly = meanAnomalyAt(jd, orbit);
    const solution = solveKeplerTraced(meanAnomaly, el.e);
    iterations = solution.iterations;

    const e = el.e;
    const eccentric = (solution.eccentricAnomaly * Math.PI) / 180;
    const trueAnomaly =
      (2 *
        Math.atan2(
          Math.sqrt(1 + e) * Math.sin(eccentric / 2),
          Math.sqrt(1 - e) * Math.cos(eccentric / 2),
        ) *
        180) /
      Math.PI;

    lines.push(
      { labelKey: 'calc.kepler.eccentricity', formula: 'e', value: e, unit: 'ratio' },
      {
        labelKey: 'calc.meanAnomaly',
        formula: 'M = L − ϖ',
        value: normalizeDeg(meanAnomaly),
        unit: 'degrees',
      },
      {
        labelKey: 'calc.kepler.eccentricAnomaly',
        formula: 'M = E − e sin E',
        value: normalizeDeg(solution.eccentricAnomaly),
        unit: 'degrees',
      },
      {
        labelKey: 'calc.kepler.trueAnomaly',
        formula: 'ν',
        value: normalizeDeg(trueAnomaly),
        unit: 'degrees',
      },
      {
        labelKey: 'calc.kepler.radius',
        formula: 'r = a(1 − e cos E)',
        value: el.a * (1 - e * Math.cos(eccentric)),
        unit: 'au',
      },
    );
  }

  lines.push({
    labelKey: 'calc.apparentLongitude',
    formula: 'λ',
    value: normalizeDeg(apparentLongitude(keplerianPositions(jd), observer, body)),
    unit: 'degrees',
    isResult: true,
  });

  return {
    engineId: 'keplerian',
    lines,
    costKey: 'calc.cost.kepler',
    costValues: { iterations },
  };
}

/** Integration step the shared simulation runs at, days. Mirrors `nbody.ts`. */
const NBODY_STEP_DAYS = 0.25;
/** Force evaluations per step: Yoshida's three Verlet sub-steps. */
const NBODY_EVALUATIONS_PER_STEP = 3;

/**
 * Newton: no working to show, because there is none.
 *
 * There is no expression for where Mars will be. There is only the force law and
 * a great many small steps, which is why this model had to wait for machines
 * that could take them. The figures below are the labour the browser is doing on
 * the reader's behalf, and they are worth seeing next to Ptolemy's two additions.
 */
function nbodyCalculation(jd: number, body: BodyId, observer: BodyId): ModelCalculation {
  const steps = Math.round(Math.abs(jd - J2000) / NBODY_STEP_DAYS);

  return {
    engineId: 'nbody',
    lines: [
      { labelKey: 'calc.newton.law', formula: 'F = G m₁ m₂ / r²', value: null, unit: 'none' },
      {
        labelKey: 'calc.newton.step',
        formula: 'Δt',
        value: NBODY_STEP_DAYS,
        unit: 'days',
      },
      {
        labelKey: 'calc.newton.steps',
        formula: '|t − t₀| / Δt',
        value: steps,
        unit: 'count',
      },
      {
        labelKey: 'calc.apparentLongitude',
        formula: 'λ',
        value: normalizeDeg(apparentLongitude(nbodyEngine.positionsAt(jd), observer, body)),
        unit: 'degrees',
        isResult: true,
      },
    ],
    costKey: 'calc.cost.newton',
    costValues: { evaluations: steps * NBODY_EVALUATIONS_PER_STEP },
  };
}

/**
 * Every model's working for one body on one date, in historical order.
 *
 * Ordered oldest first so the columns read as a chronology: the labour grows
 * down the list at the same time as the error shrinks.
 */
export function calculationsFor(
  jd: number,
  body: BodyId,
  observer: BodyId,
): ModelCalculation[] {
  return [
    ptolemaicCalculation(jd, body, observer),
    circularCalculation(jd, body, observer),
    keplerianCalculation(jd, body, observer),
    nbodyCalculation(jd, body, observer),
  ];
}
