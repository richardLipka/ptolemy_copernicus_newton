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
 * step by step, in the order an astronomer would have carried it out.
 *
 * The labour rises steeply from Ptolemy to Kepler — two table look-ups and two
 * additions against a transcendental equation solved by iteration, per body and
 * per date, by hand — and then stops rising. Newton's two-body solution is
 * Kepler's ellipse, so it needs no new arithmetic at all; what it adds is a
 * *reason*, and a period computable from the masses. See `newtonCalculation`,
 * which is the column most easily got wrong.
 *
 * Every figure here is pulled from the engines themselves rather than recomputed
 * for display, so the panel cannot drift away from what the map is drawing.
 */

import { BODIES, GM_SUN, type BodyId } from './bodies.js';
import { apparentLongitude } from './coordinates.js';
import { copernicanHeliocentricAt, copernicanPositions } from './engines/copernican.js';
import {
  elementsAt,
  keplerianPositions,
  meanAnomalyAt,
  solveKeplerTraced,
} from './engines/keplerian.js';
import { nbodyEngine } from './engines/nbody.js';
import { ptolemaicEpicyclicPositions, ptolemaicGeometryFor } from './engines/ptolemaic.js';
import type { EngineId } from './engines/types.js';
import { J2000 } from './time.js';
import { normalizeDeg } from './vec.js';

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
  /** Which engine's number the result line reports. */
  engineId: EngineId;
  /**
   * Column heading. Separate from the engine label because Newton's column is
   * about a *method* rather than about this app's integrator — see
   * `newtonCalculation`.
   */
  titleKey: string;
  lines: CalculationLine[];
  /** i18n key summarising the labour of one position, and its substitutions. */
  costKey: string;
  costValues?: Record<string, number>;
  /**
   * i18n key for the *tables* — which ones existed for this model, and what it
   * took to build them.
   *
   * The cost line above is the price of one position. It is the smaller half of
   * the story: nobody computed a planet from first principles when they wanted
   * one, they opened a book. Making that book is where the real labour, and the
   * characteristic difficulty of each model, actually lived.
   */
  tablesKey: string;
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
    titleKey: 'engine.ptolemaic-epicyclic',
    tablesKey: 'calc.tables.ptolemy',
    lines,
    costKey: geometry?.equant ? 'calc.cost.ptolemy' : 'calc.cost.ptolemySun',
  };
}

/**
 * Copernicus: a mean longitude and one correction, read from a table.
 *
 * The same shape of working as Ptolemy's, and at about the same price — which is
 * the awkward fact of 1543. His eccentric-plus-epicyclet produces an equation of
 * centre exactly as the equant does, so a computer using the *Prutenic Tables*
 * did no less arithmetic than one using the Alfonsine, and got no better answer.
 * The case for the new system had to rest on something other than labour or
 * accuracy.
 */
function copernicanCalculation(jd: number, body: BodyId, observer: BodyId): ModelCalculation {
  const lines: CalculationLine[] = [];
  const orbit = BODIES[body].orbit;

  if (orbit) {
    const el = elementsAt(jd, orbit);
    const meanAnomaly = meanAnomalyAt(jd, orbit);
    const heliocentric = longitudeOf(copernicanHeliocentricAt(jd, orbit));

    lines.push(
      {
        labelKey: 'calc.meanLongitude',
        formula: 'L',
        value: normalizeDeg(el.L),
        unit: 'degrees',
      },
      { labelKey: 'calc.copernicus.radius', formula: 'a', value: el.a, unit: 'au' },
      {
        labelKey: 'calc.meanAnomaly',
        formula: 'M = L − ϖ',
        value: normalizeDeg(meanAnomaly),
        unit: 'degrees',
      },
      {
        // What the eccentric and its epicyclet are between them worth: the
        // difference between where uniform motion would put the planet and
        // where the construction actually does.
        labelKey: 'calc.copernicus.equationOfCentre',
        formula: 'λ☉ − L',
        value: asCorrection(heliocentric - el.L),
        unit: 'signedDegrees',
      },
      {
        labelKey: 'calc.copernicus.heliocentric',
        formula: 'λ☉',
        value: heliocentric,
        unit: 'degrees',
      },
    );
  }

  lines.push({
    labelKey: 'calc.apparentLongitude',
    formula: 'λ',
    value: normalizeDeg(apparentLongitude(copernicanPositions(jd), observer, body)),
    unit: 'degrees',
    isResult: true,
  });

  return {
    engineId: 'copernican',
    titleKey: 'engine.copernican',
    tablesKey: 'calc.tables.copernicus',
    lines,
    costKey: 'calc.cost.copernicus',
  };
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
    titleKey: 'engine.keplerian',
    tablesKey: 'calc.tables.kepler',
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
 * Newton — and the thing it is easiest to get wrong about him.
 *
 * He did **not** integrate step by step. That is a twentieth-century technique
 * and needs a machine. The *Principia* solves the two-body problem in closed
 * form: Book I proves that an inverse-square force toward a focus produces a
 * conic section, and conversely. So for a single planet Newton's method yields
 * *Kepler's own ellipse*, and the working above his column is his working too.
 * He needed no new arithmetic to place Mars.
 *
 * What he added instead was twofold, and neither part is a shortcut:
 *
 *   - The ellipse stopped being a shape fitted to Tycho's observations and
 *     became a consequence of a force. Same curve, entirely different standing.
 *   - Kepler's third law gained its missing constant. `P² = 4π²a³ / G(M + m)`
 *     lets the period be *computed from the masses* rather than measured — which
 *     run backwards is how the Sun came to be weighed. The period on this column
 *     is derived that way and lands within a fraction of a day.
 *
 * Beyond two bodies there is no closed form, and Newton knew it; the lunar
 * theory is where he said the problem made his head ache. He attacked it by
 * perturbation. The step-by-step integration this app's map runs is a modern
 * stand-in for that, which is why its answer appears here as a separate line
 * rather than as Newton's.
 */
function newtonCalculation(jd: number, body: BodyId, observer: BodyId): ModelCalculation {
  const lines: CalculationLine[] = [
    { labelKey: 'calc.newton.law', formula: 'F = G m₁ m₂ / r²', value: null, unit: 'none' },
  ];

  const orbit = BODIES[body].orbit;
  if (orbit) {
    // The two-body gravitational parameter: the *sum* of the masses governs
    // relative motion, which is the correction Kepler's third law was missing.
    const mu = GM_SUN + BODIES[body].gm;
    const semiMajor = elementsAt(jd, orbit).a;
    lines.push({
      labelKey: 'calc.newton.period',
      formula: 'P = 2π√(a³/μ)',
      value: 2 * Math.PI * Math.sqrt(semiMajor ** 3 / mu),
      unit: 'days',
    });
  }

  // Newton's own answer for one planet, which is Kepler's ellipse derived
  // rather than fitted — so it is the Keplerian engine that produces it.
  lines.push({
    labelKey: 'calc.newton.twoBody',
    formula: 'λ',
    value: normalizeDeg(apparentLongitude(keplerianPositions(jd), observer, body)),
    unit: 'degrees',
  });

  lines.push({
    labelKey: 'calc.newton.integrated',
    formula: 'λ',
    value: normalizeDeg(apparentLongitude(nbodyEngine.positionsAt(jd), observer, body)),
    unit: 'degrees',
    isResult: true,
  });

  const steps = Math.round(Math.abs(jd - J2000) / NBODY_STEP_DAYS);

  return {
    engineId: 'nbody',
    titleKey: 'calc.newton.title',
    tablesKey: 'calc.tables.newton',
    lines,
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
    copernicanCalculation(jd, body, observer),
    keplerianCalculation(jd, body, observer),
    newtonCalculation(jd, body, observer),
  ];
}
