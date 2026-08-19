/**
 * What each piece of the harness is worth, in numbers, at this instant.
 *
 * The drawn machinery shows how a model works; it does not show how much it
 * claims. Ptolemy's epicycle for Mars is a circle of a particular size, and the
 * size *is* the claim: r/R is 39;30 of 60, and its reciprocal is 1.519 — the
 * planet's distance from the Sun, asserted in a model that grants the Sun no
 * privilege whatever. A reader who can watch the mechanism turn but cannot get
 * at that number never learns what it says.
 *
 * Everything is measured from the construction the map actually draws, before
 * projection. The compressed scale distorts every distance on screen, and
 * quoting those distortions back as Ptolemy's figures would be worse than
 * quoting nothing.
 *
 * Units follow the running model rather than the app: see
 * `core/engines/ptolemaicUnits.ts`. The Almagest fixes no absolute distance at
 * all, so a figure from one of his constructions is given in parts of the body's
 * own deferent of 60, exactly as the info panel gives its distances.
 */

import { AU_IN_KM, BODIES, type BodyId } from '@orrery/core/bodies';
import {
  constructionFamilyOf,
  type Construction,
  type ConstructionFamily,
  type ConstructionRole,
} from '@orrery/core/construction';
import { ENGINES } from '@orrery/core/engines/registry';
import type { PositionSet } from '@orrery/core/engines/types';
import { DEG, angleDiffDeg, length, normalizeDeg, sub, type Vec3 } from '@orrery/core/vec';
import { rawConstruction, type VectorRole } from './selectors';
import type { State } from './store';

/** Every part of the machinery a reader can point at, circles and vectors alike. */
export type HarnessRole = ConstructionRole | VectorRole;

export type HarnessUnit =
  | 'au'
  | 'km'
  /** Sixtieths of the body's own deferent — the only unit the Almagest has. */
  | 'parts'
  | 'deg'
  | 'degPerDay'
  | 'days'
  | 'ratio'
  | 'kmPerSecond'
  | 'newton'
  /** A fraction of the whole, formatted as a percentage. */
  | 'share';

export interface HarnessMeasure {
  /** Names the label: `harness.value.<key>`. */
  key: string;
  value: number;
  unit: HarnessUnit;
  /**
   * Also worth giving the Almagest's own way, as 39;30 rather than 39.5.
   *
   * Set only on the fixed parameters of a construction — never on a reading
   * that changes with the date, which Ptolemy would have taken from a table
   * rather than stated sexagesimally in the text.
   */
  sexagesimal?: boolean;
}

export interface HarnessPart {
  role: HarnessRole;
  bodyId: BodyId;
  family: ConstructionFamily;
  /** A moon, whose machinery is the counterfactual rather than the model's own. */
  satellite: boolean;
  /** What the geometry is drawn about: the Earth, the Sun, or a moon's planet. */
  centreBody: BodyId;
  /** Which of the two foci: the one the body is drawn about, or the empty one. */
  variant?: 'occupied' | 'empty';
  /** The attracting body, for one of Newton's pulls. */
  source?: BodyId;
  measures: HarnessMeasure[];
}

export interface HarnessTarget {
  /** Position within `construction.markers`, where one role has several. */
  markerIndex?: number;
  /** Which body pulls, for a gravity vector. */
  source?: BodyId;
}

/**
 * How far apart a rate is sampled, days.
 *
 * A day either side of the date suits anything on a planetary orbit, and the
 * Moon at thirteen degrees a day is still comfortably inside one turn. **Io is
 * not**: it goes round Jupiter in forty-two hours, so sampling it a day apart
 * reads its 203 degrees a day as −157, the sign inverted and the figure wrong
 * — the difference is aliased exactly as an undersampled signal is. Anything
 * with a known short period is therefore sampled against its own period
 * instead, at a twentieth of one turn.
 */
function rateStepDays(bodyId: BodyId): number {
  const period = BODIES[bodyId].satellite?.periodDays;
  return period ? Math.min(1, period / 20) : 1;
}

/** Ecliptic longitude of a vector, degrees. */
const lonOf = (v: Vec3): number => normalizeDeg(Math.atan2(v.y, v.x) / DEG);

const circleOf = (
  construction: Construction,
  role: ConstructionRole,
): { centre: Vec3; radius: number } | null =>
  construction.circles.find((circle) => circle.role === role) ?? null;

const armOf = (
  construction: Construction,
  role: ConstructionRole,
): { from: Vec3; to: Vec3 } | null =>
  construction.arms.find((arm) => arm.role === role) ?? null;

const markersOf = (construction: Construction, role: ConstructionRole): Vec3[] =>
  construction.markers.filter((marker) => marker.role === role).map((marker) => marker.at);

/**
 * What a body's machinery is drawn about.
 *
 * Not the frame origin and not the observer: the point the *construction* is
 * built from, which is the Earth in Ptolemy's models, the Sun in the
 * heliocentric ones, and the planet for a moon. Every model here draws the Moon
 * about the Earth, the heliocentric ones included.
 */
export function harnessCentre(state: State, bodyId: BodyId): BodyId {
  const parent = BODIES[bodyId].parent;
  if (BODIES[bodyId].satellite && parent) return parent;
  if (bodyId === 'moon') return 'earth';
  return constructionFamilyOf(state.engineId) === 'ptolemaic' ? 'earth' : 'sun';
}

/**
 * Two-body period from a semi-major axis, days.
 *
 * Withheld from Ptolemy's constructions on purpose. His deferent radii are not
 * dynamical quantities — the Almagest fixes none of them, and the absolute scale
 * this app draws them at comes from the nested spheres of the Planetary
 * Hypotheses. Kepler's third law applied to such a radius would return a
 * confident number about a claim the model does not contain.
 */
function periodDays(
  bodyId: BodyId,
  centreBody: BodyId,
  semiMajorAu: number,
  family: ConstructionFamily,
): number | null {
  if (family === 'ptolemaic') return null;
  const mu = BODIES[centreBody].gm + BODIES[bodyId].gm;
  if (!(semiMajorAu > 0) || !(mu > 0)) return null;
  return 2 * Math.PI * Math.sqrt(semiMajorAu ** 3 / mu);
}

interface Frame {
  construction: Construction;
  positions: PositionSet;
  family: ConstructionFamily;
  centreBody: BodyId;
  origin: Vec3;
  satellite: boolean;
  /** The circle or ellipse the model states its other lengths against, AU. */
  scale: number | null;
  /** A length in AU, in whichever unit the running model actually had. */
  toUnit: (au: number) => { value: number; unit: HarnessUnit };
}

function frameFor(state: State, bodyId: BodyId): Frame | null {
  const raw = rawConstruction(state, bodyId);
  if (!raw) return null;

  const { construction, positions } = raw;
  const family = constructionFamilyOf(state.engineId);
  const centreBody = harnessCentre(state, bodyId);
  const origin = positions.get(centreBody);
  if (!origin) return null;

  const deferent = circleOf(construction, 'deferent');
  const ellipse = construction.ellipses?.[0];
  const scale = deferent ? deferent.radius : ellipse ? length(ellipse.majorAxis) : null;

  /*
   * A moon keeps kilometres even while one of Ptolemy's models is running.
   *
   * Parts of its own orbit would be a unit nobody has ever used, and parts of
   * its planet's deferent — what `inDeferentParts` rightly gives a moon for its
   * distance from the Earth — makes the whole Jovian system a rounding error:
   * Io's orbit is three hundredths of one part of Jupiter's deferent. The moons
   * are an anachronism in this mode anyway, and the honest way to show an
   * anachronism is in a unit that admits to being one.
   */
  const satellite = BODIES[bodyId].satellite !== undefined;
  const inParts = family === 'ptolemaic' && !satellite && scale !== null && scale > 0;

  const toUnit = (au: number): { value: number; unit: HarnessUnit } => {
    if (inParts && scale) return { value: (au / scale) * 60, unit: 'parts' };
    /*
     * Below a hundredth of an astronomical unit the unit stops informing
     * anyone: the Moon's orbit reads 0.003 and every Galilean reads 0.00.
     *
     * A length of exactly zero is judged by the figure it belongs beside
     * rather than by itself — a concentric circle's offset is a real and
     * interesting nothing, and reporting it as "0 km" beside a radius in
     * astronomical units makes it look like a rounding artefact.
     */
    const magnitude = au !== 0 ? Math.abs(au) : Math.abs(scale ?? 0);
    if (magnitude < 0.01) return { value: au * AU_IN_KM, unit: 'km' };
    return { value: au, unit: 'au' };
  };

  return { construction, positions, family, centreBody, origin, satellite, scale, toUnit };
}

type Pivot = (construction: Construction, origin: Vec3) => Vec3 | null;

/**
 * How fast a line turns about each of several points, degrees per day.
 *
 * Taken by asking the engine for the same construction a half-day either side
 * rather than by differentiating anything here: the engine is what knows how its
 * model moves, and a second derivation could drift from the one on screen
 * without either looking wrong.
 *
 * The equant is the reason this exists. Its whole content is that one rate is
 * constant while the other is not, and no still picture can show that. It is
 * also the reason several pivots are answered at once: the two rates it needs
 * are the same line measured about two points, so they come from one pair of
 * samples rather than two — the constructions either side are rebuilt once,
 * not twice, and under Newton rebuilding one runs the integrator.
 */
function turnRates(
  state: State,
  bodyId: BodyId,
  tip: (construction: Construction) => Vec3 | null,
  pivots: Pivot[],
): (number | null)[] {
  const step = rateStepDays(bodyId);
  const half = step / 2;
  const centreBody = harnessCentre(state, bodyId);

  const sample = (jd: number): (number | null)[] | null => {
    const raw = rawConstruction(state, bodyId, jd);
    if (!raw) return null;
    const origin = raw.positions.get(centreBody);
    if (!origin) return null;
    const to = tip(raw.construction);
    if (!to) return null;

    return pivots.map((pivot) => {
      const from = pivot(raw.construction, origin);
      return from ? lonOf(sub(to, from)) : null;
    });
  };

  const before = sample(state.julianDate - half);
  const after = sample(state.julianDate + half);
  if (!before || !after) return pivots.map(() => null);

  return pivots.map((_, i) => {
    const from = before[i];
    const to = after[i];
    return from === null || from === undefined || to === null || to === undefined
      ? null
      : angleDiffDeg(to, from) / step;
  });
}

/** One line about one point — the common case. */
const turnRate = (
  state: State,
  bodyId: BodyId,
  pivot: Pivot,
  tip: (construction: Construction) => Vec3 | null,
): number | null => turnRates(state, bodyId, tip, [pivot])[0] ?? null;

/** The far end of an arm: what the pivot is carrying round. */
const armTip =
  (role: ConstructionRole) =>
  (construction: Construction): Vec3 | null =>
    armOf(construction, role)?.to ?? null;

function dynamicsMeasures(
  state: State,
  bodyId: BodyId,
  role: VectorRole,
  source?: BodyId,
): HarnessMeasure[] | null {
  const engine = ENGINES[state.engineId];
  const dynamics = engine.dynamics?.(state.julianDate, bodyId);
  if (!dynamics) return null;

  if (role === 'velocity') {
    return [{ key: 'speed', value: dynamics.speedKmPerSecond, unit: 'kmPerSecond' }];
  }

  if (role === 'net-force') {
    return [{ key: 'force', value: dynamics.netNewtons, unit: 'newton' }];
  }

  const pull = dynamics.pulls.find((candidate) => candidate.source === source);
  if (!pull) return null;

  const measures: HarnessMeasure[] = [
    { key: 'force', value: pull.newtons, unit: 'newton' },
    { key: 'share', value: pull.share, unit: 'share' },
  ];

  // The separation as well, because the pull is what it is for a reason the
  // reader can check on the spot: halve the distance and the force quadruples.
  const positions = engine.positionsAt(state.julianDate);
  const here = positions.get(bodyId);
  const there = positions.get(pull.source);
  if (here && there) measures.push({ key: 'separation', value: length(sub(there, here)), unit: 'au' });

  return measures;
}

/**
 * The numbers one part of the harness carries, or null where it carries none.
 *
 * `role` and `markerIndex` come straight off the hovered element, which is why
 * a marker is identified by its position in the construction rather than by its
 * meaning: the two foci are drawn identically and only their order tells them
 * apart.
 */
export function measureHarnessPart(
  state: State,
  bodyId: BodyId,
  role: HarnessRole,
  target: HarnessTarget = {},
): HarnessPart | null {
  const family = constructionFamilyOf(state.engineId);
  const centreBody = harnessCentre(state, bodyId);

  if (role === 'velocity' || role === 'net-force' || role === 'gravity') {
    const measures = dynamicsMeasures(state, bodyId, role, target.source);
    if (!measures) return null;
    return {
      role,
      bodyId,
      family,
      satellite: BODIES[bodyId].satellite !== undefined,
      centreBody,
      source: target.source,
      measures,
    };
  }

  const frame = frameFor(state, bodyId);
  if (!frame) return null;

  const { construction, origin, positions, satellite, toUnit } = frame;
  const measures: HarnessMeasure[] = [];
  let variant: 'occupied' | 'empty' | undefined;

  /** A distance, in the unit the running model states its distances in. */
  const distance = (key: string, au: number, parameter = false): void => {
    const { value, unit } = toUnit(au);
    measures.push({ key, value, unit, sexagesimal: parameter && unit === 'parts' });
  };
  const ratio = (key: string, value: number): void => {
    measures.push({ key, value, unit: 'ratio' });
  };
  const angle = (key: string, value: number): void => {
    measures.push({ key, value, unit: 'deg' });
  };
  const rate = (key: string, value: number | null): void => {
    if (value !== null) measures.push({ key, value, unit: 'degPerDay' });
  };

  const ellipse = construction.ellipses?.[0];
  const axes = ellipse
    ? (() => {
        const a = length(ellipse.majorAxis);
        const b = length(ellipse.minorAxis);
        return { a, b, e: a > 0 ? Math.sqrt(Math.max(0, 1 - (b / a) ** 2)) : 0 };
      })()
    : null;

  /**
   * Copernicus's eccentricity, read back out of what he drew with it.
   *
   * He splits it: the circle's centre goes 3/2·ae off the Sun and the epicyclet
   * carries the other 1/2·ae, so the two together are exactly 2ae and the
   * orbit's own e follows. Taken from the geometry rather than from his
   * parameters, so a fitted set that moved the split still reports the orbit it
   * actually drew.
   */
  const copernicanEccentricity = (): number | null => {
    const deferent = circleOf(construction, 'deferent');
    const epicycle = circleOf(construction, 'epicycle');
    if (!deferent || !epicycle || !(deferent.radius > 0)) return null;
    const offset = length(sub(deferent.centre, origin));
    return (offset + epicycle.radius) / (2 * deferent.radius);
  };

  switch (role) {
    case 'deferent': {
      const deferent = circleOf(construction, 'deferent');
      if (!deferent) return null;

      const offset = length(sub(deferent.centre, origin));
      // Not sexagesimally: under Ptolemy this radius is 60 parts by definition,
      // and "60;0" dresses a definition up as a measurement.
      distance('radius', deferent.radius);
      distance('offset', offset, true);
      if (deferent.radius > 0 && offset > 0) ratio('offsetRatio', offset / deferent.radius);

      const period = periodDays(bodyId, centreBody, deferent.radius, family);
      if (period !== null) measures.push({ key: 'period', value: period, unit: 'days' });
      break;
    }

    case 'epicycle': {
      const epicycle = circleOf(construction, 'epicycle');
      const deferent = circleOf(construction, 'deferent');
      if (!epicycle) return null;

      distance('radius', epicycle.radius, true);
      if (deferent && deferent.radius > 0) {
        const share = epicycle.radius / deferent.radius;
        ratio('ratio', share);

        /*
         * The ratio, read as the distance it implies.
         *
         * For a superior planet Ptolemy's r/R is exactly 1/a in astronomical
         * units, and for an inferior one it is a itself — because the epicycle
         * is the Earth's own orbit under another name. He had every planet's
         * distance from the Sun written down and no way to know it, and this is
         * the one number in the app that says so.
         */
        const trueAu = BODIES[bodyId].orbit?.epoch.a ?? null;
        if (family === 'ptolemaic' && !satellite && trueAu !== null && share > 0) {
          measures.push({
            key: 'impliedDistance',
            value: trueAu > 1 ? 1 / share : share,
            unit: 'au',
          });
          measures.push({ key: 'trueDistance', value: trueAu, unit: 'au' });
        }
      }
      break;
    }

    case 'orbit': {
      if (!axes) return null;
      distance('semiMajor', axes.a);
      ratio('eccentricity', axes.e);
      // How nearly a circle it is. Mars's ellipse is within half a percent of
      // one; what the eye actually sees is the Sun sitting off the centre.
      if (axes.a > 0) ratio('axisRatio', axes.b / axes.a);

      const period = periodDays(bodyId, centreBody, axes.a, family);
      if (period !== null) measures.push({ key: 'period', value: period, unit: 'days' });
      break;
    }

    case 'centre': {
      const centre = markersOf(construction, 'centre')[0];
      if (!centre) return null;

      const offset = length(sub(centre, origin));
      distance('offset', offset, true);
      if (frame.scale && frame.scale > 0 && offset > 0) {
        ratio('offsetRatio', offset / frame.scale);
      }
      if (axes) ratio('eccentricity', axes.e);
      else if (family === 'copernican' && !satellite) {
        const e = copernicanEccentricity();
        if (e !== null) ratio('eccentricity', e);
      }
      break;
    }

    case 'equant': {
      const equant = markersOf(construction, 'equant')[0];
      if (!equant) return null;

      distance('offset', length(sub(equant, origin)), true);

      // The equant's entire content, in two numbers that differ: the arm turns
      // at one rate about this point and at another about the Earth. One line
      // measured about two points, so both come from the same pair of samples.
      const [uniform, apparent] = turnRates(state, bodyId, armTip('deferent-arm'), [
        (candidate) => markersOf(candidate, 'equant')[0] ?? null,
        (_, from) => from,
      ]);
      rate('uniformRate', uniform ?? null);
      rate('apparentRate', apparent ?? null);
      break;
    }

    case 'apsidal': {
      const apsidal = armOf(construction, 'apsidal');
      if (!apsidal) return null;

      const far = length(sub(apsidal.to, origin));
      const near = length(sub(apsidal.from, origin));

      /*
       * A concentric circle has no apsidal line, and this one is drawn anyway.
       *
       * Ptolemy's simple lunar model puts the Moon's deferent centre on the
       * Earth, so the "apogee" the engine hands back is just wherever the arm
       * is pointing today. The two ends being equal is the fact worth reporting
       * — that circle is concentric — and a direction is not.
       */
      if (Math.abs(far - near) > 1e-9 * Math.max(far, near)) {
        angle('direction', lonOf(sub(apsidal.to, origin)));
      }

      /*
       * Copernicus's apsidal line is the *deferent's*, and its ends fall half an
       * ae short of the orbit's own because the epicyclet carries the rest.
       * Calling them aphelion and perihelion would be calling two numbers
       * something neither quite is, so his line reports its direction and the
       * eccentricity it was built from instead.
       */
      if (family === 'copernican' && !satellite) {
        const e = copernicanEccentricity();
        if (e !== null) ratio('eccentricity', e);
      } else {
        distance('far', far);
        distance('near', near);
      }
      break;
    }

    case 'deferent-arm':
    case 'epicycle-arm':
    case 'radius': {
      const arm = armOf(construction, role);
      if (!arm) return null;

      const along = sub(arm.to, arm.from);
      distance('length', length(along), role === 'epicycle-arm');
      angle('direction', lonOf(along));

      rate(
        'rate',
        turnRate(
          state,
          bodyId,
          (candidate) => armOf(candidate, role)?.from ?? null,
          armTip(role),
        ),
      );

      /*
       * Where the Sun stands, beside an arm that keeps step with it.
       *
       * In Ptolemy's planetary models one of the two arms is the Earth's own
       * orbit in disguise — the deferent for an inferior planet, the epicycle
       * for a superior one — and it follows the mean Sun exactly. Printing the
       * Sun's direction beside both lets the reader find out which, which is the
       * discovery Copernicus made out of the same coincidence.
       */
      if (family === 'ptolemaic' && !satellite && role !== 'radius') {
        const sun = positions.get('sun');
        const earth = positions.get('earth');
        if (sun && earth) angle('sunDirection', lonOf(sub(sun, earth)));
      }

      if (role === 'radius' && axes) {
        const period = periodDays(bodyId, centreBody, axes.a, family);
        if (period !== null) rate('meanRate', 360 / period);
      }
      break;
    }

    case 'focus': {
      const foci = markersOf(construction, 'focus');
      if (foci.length === 0) return null;

      const marker =
        target.markerIndex !== undefined
          ? (construction.markers[target.markerIndex]?.at ?? foci[0]!)
          : foci[0]!;

      // The occupied focus is the one the body is drawn about, found by distance
      // rather than by index: the engines emit them in their own order, and only
      // one of the two ever has anything on it.
      const nearest = foci.reduce((best, candidate) =>
        length(sub(candidate, origin)) < length(sub(best, origin)) ? candidate : best,
      );
      variant = marker === nearest ? 'occupied' : 'empty';

      if (axes) {
        distance('focusSeparation', 2 * axes.a * axes.e);
        ratio('eccentricity', axes.e);
      }
      if (variant === 'occupied') {
        const radius = armOf(construction, 'radius');
        if (radius) distance('distanceNow', length(sub(radius.to, radius.from)));
      }
      break;
    }

    default:
      return null;
  }

  if (measures.length === 0) return null;
  return {
    role,
    bodyId,
    family,
    satellite,
    centreBody,
    variant,
    source: target.source,
    measures,
  };
}
