/**
 * Derived view data: everything the renderer needs, in geometry-free form.
 *
 * Screen coordinates are expressed in units of the map radius, so 1.0 is the
 * edge of the plan view and the zodiac ring sits just beyond it. CSS multiplies
 * by the real pixel radius, which keeps the layer resolution-independent and
 * means a resize needs no recomputation.
 */

import { BODY_IDS, type BodyId } from '../core/bodies';
import type { ConstructionRole } from '../core/construction';
import { apparentLongitude, relativePosition } from '../core/coordinates';
import type { EngineId, PositionSet } from '../core/engines/types';
import { recenter } from '../core/frame';
import { illuminationOf, type Illumination } from '../core/illumination';
import { DEG, length, sub, vec3, type Vec3 } from '../core/vec';
import { locate, type ZodiacPosition } from '../core/zodiac';
import type { ScaleMode, State } from './store';
import { ENGINES } from './store';
import type { TrailSample } from './trails';

export interface Point {
  x: number;
  y: number;
}

/**
 * Outer edge of the modelled system, AU.
 *
 * Must cover the *largest* model, not the true one, and all models must share it
 * — the ghost overlay draws two at once, and a comparison between two different
 * scales would be meaningless.
 *
 * The binding constraint is Ptolemy's nested spheres, which put Saturn's shell
 * at 12.3–17.2 AU against the real 9.0–10.1. His cosmos genuinely is larger,
 * measured in units of the Sun's distance, and that is worth seeing. Sized at
 * 10.1 the outer Ptolemaic planets projected past 1.0 and drew straight through
 * the zodiac ring.
 *
 * The cost is a heliocentric map about 85% of its former radius. That was a real
 * loss before the wheel zoom existed; it is a small one now.
 */
const SYSTEM_RADIUS_AU = 17.5;

/**
 * Softening constant for the compressed scale, AU.
 *
 * Chosen so Mercury lands around a quarter of the map radius and Saturn near
 * the edge — the whole system legible at once. At true scale Mercury sits at
 * 0.04 of the radius and the inner planets pile into a smudge, which is honest
 * and unreadable, hence the toggle.
 */
const COMPRESSION_SOFTENING = 0.3;

const compressedDenominator = Math.log(1 + SYSTEM_RADIUS_AU / COMPRESSION_SOFTENING);

/** Map a distance in AU to a fraction of the map radius, preserving direction. */
export function projectRadius(au: number, scaleMode: ScaleMode): number {
  if (au <= 0) return 0;
  if (scaleMode === 'true') return au / SYSTEM_RADIUS_AU;
  return Math.log(1 + au / COMPRESSION_SOFTENING) / compressedDenominator;
}

/**
 * Radius at which the Moon's orbit is drawn, in map-radius units.
 *
 * The Moon is 0.0026 AU from Earth. Projected honestly it would sit a third of
 * a pixel away and be invisible at any scale that also shows Saturn, so its
 * orbit is drawn at an exaggerated radius that breathes with the real distance.
 * This is the one place the map knowingly lies about a distance, and it lies the
 * same way every orrery ever built has.
 *
 * The size is constrained, though, and by Ptolemy. Once his deferents were
 * scaled to the nested spheres, Mercury came in to 0.058–0.143 AU — barely
 * outside the Moon — and the old exaggeration of 0.055 drew the Moon *beyond*
 * Mercury on a fifth of all days, inverting the one ordering his cosmology is
 * most famous for.
 */
const MOON_ORBIT_RADIUS = 0.03;
const MOON_MEAN_DISTANCE_AU = 0.00257;

/**
 * Fraction of Mercury's drawn separation the Moon may occupy.
 *
 * A backstop for views where even the reduced exaggeration is too large — a
 * Ptolemaic map recentred on the Sun draws Earth and Mercury almost on top of
 * each other. The Moon shrinks rather than overtake the innermost planet, to
 * nothing if it must: an invisible Moon is a smaller lie than one above Mercury.
 */
const MOON_MAX_SHARE_OF_MERCURY = 0.45;

/** Drawn radius of the Moon's orbit about Earth, in map-radius units. */
function moonDrawnRadius(trueDistanceAu: number, mercuryGap: number | null): number {
  const exaggerated = MOON_ORBIT_RADIUS * (trueDistanceAu / MOON_MEAN_DISTANCE_AU);
  if (mercuryGap === null) return exaggerated;
  return Math.min(exaggerated, mercuryGap * MOON_MAX_SHARE_OF_MERCURY);
}

/** How far Mercury is drawn from Earth, or null if it is not on the map. */
function mercuryGapFrom(earth: Point, projected: Map<BodyId, Point>): number | null {
  const mercury = projected.get('mercury');
  if (!mercury) return null;
  return Math.hypot(mercury.x - earth.x, mercury.y - earth.y);
}

function projectVector(v: Vec3, scaleMode: ScaleMode): Point {
  const distance = Math.hypot(v.x, v.y);
  if (distance === 0) return { x: 0, y: 0 };

  const radius = projectRadius(distance, scaleMode);
  return { x: (v.x / distance) * radius, y: (v.y / distance) * radius };
}

/**
 * Screen positions for every body.
 *
 * The Moon is placed relative to Earth's projected position rather than
 * projected from the frame origin, so that it stays visibly a satellite
 * whatever the map is centred on.
 */
export function projectPositions(
  positions: PositionSet,
  frameOrigin: BodyId,
  scaleMode: ScaleMode,
): Map<BodyId, Point> {
  const centred = recenter(positions, frameOrigin);
  const projected = new Map<BodyId, Point>();

  for (const id of BODY_IDS) {
    const vector = centred.get(id);
    if (!vector) continue;
    if (id === 'moon') continue;
    projected.set(id, projectVector(vector, scaleMode));
  }

  const moon = centred.get('moon');
  const earth = projected.get('earth');
  if (moon && earth) {
    const offset = sub(moon, centred.get('earth')!);
    const distance = Math.hypot(offset.x, offset.y);
    const radius = moonDrawnRadius(distance, mercuryGapFrom(earth, projected));
    projected.set('moon', {
      x: earth.x + (offset.x / distance) * radius,
      y: earth.y + (offset.y / distance) * radius,
    });
  } else if (moon) {
    projected.set('moon', projectVector(moon, scaleMode));
  }

  return projected;
}

export interface BodyView {
  id: BodyId;
  point: Point;
  /** True apparent ecliptic longitude from the observation point, degrees. */
  apparentLongitude: number;
  zodiac: ZodiacPosition;
  illumination: Illumination;
  distanceFromSun: number;
  distanceFromObserver: number;
  isObserver: boolean;
}

/** One comparison model's projected positions. */
export interface GhostLayer {
  engineId: EngineId;
  points: Map<BodyId, Point>;
}

export interface OrreryView {
  bodies: BodyView[];
  /**
   * Faint comparison models. One layer for a single chosen engine, or one per
   * rival model in compare-all — where the *spread* is the message, and reading
   * it needs every model on the map at once rather than two at a time.
   */
  ghosts: GhostLayer[];
  observerPoint: Point;
  positions: PositionSet;
}

/**
 * Engines drawn by compare-all: one per model, in historical order.
 *
 * The reference is left out on purpose. It is not one of the models being
 * compared, and including it would quietly turn a comparison into a marking
 * scheme — a different question, answered by the events panel.
 */
export const COMPARISON_ENGINES: readonly EngineId[] = [
  'ptolemaic-epicyclic',
  'circular',
  'keplerian',
  'nbody',
];

export function buildView(state: State): OrreryView {
  const positions = ENGINES[state.engineId].positionsAt(state.julianDate);
  const projected = projectPositions(positions, state.frameOrigin, state.scaleMode);

  const bodies: BodyView[] = [];
  for (const id of BODY_IDS) {
    const point = projected.get(id);
    if (!point) continue;

    const isObserver = id === state.observationPoint;
    const longitude = isObserver
      ? 0
      : apparentLongitude(positions, state.observationPoint, id);

    bodies.push({
      id,
      point,
      apparentLongitude: longitude,
      zodiac: locate(longitude, state.julianDate, state.zodiacScheme),
      illumination: illuminationOf(positions, state.observationPoint, id),
      distanceFromSun: length(sub(positions.get(id)!, positions.get('sun')!)),
      distanceFromObserver: isObserver
        ? 0
        : relativePosition(positions, state.observationPoint, id).distance,
      isObserver,
    });
  }

  const ghostEngines =
    state.ghostEngineId === 'all'
      ? COMPARISON_ENGINES.filter((id) => id !== state.engineId)
      : state.ghostEngineId
        ? [state.ghostEngineId]
        : [];

  const ghosts: GhostLayer[] = ghostEngines.map((engineId) => ({
    engineId,
    points: projectPositions(
      ENGINES[engineId].positionsAt(state.julianDate),
      state.frameOrigin,
      state.scaleMode,
    ),
  }));

  return {
    bodies,
    ghosts,
    observerPoint: projected.get(state.observationPoint) ?? { x: 0, y: 0 },
    positions,
  };
}

/**
 * Project a logged trail for one body.
 *
 * Each recorded snapshot is projected against the frame origin *as it stood at
 * that moment*, which is what an observer would have plotted at the time. Centre
 * the map on Earth and Mars therefore accumulates the retrograde rosette that
 * cost Ptolemy his epicycles — not because anything here knows what a loop is,
 * but because that is where Mars was seen to be.
 */
export function projectTrail(
  samples: readonly TrailSample[],
  bodyId: BodyId,
  frameOrigin: BodyId,
  scaleMode: ScaleMode,
): Point[] {
  const points: Point[] = [];

  for (const sample of samples) {
    const body = sample.positions.get(bodyId);
    const origin = sample.positions.get(frameOrigin);
    if (!body || !origin) continue;

    if (bodyId === 'moon') {
      const earth = sample.positions.get('earth');
      if (!earth) continue;
      const earthPoint = projectVector(sub(earth, origin), scaleMode);
      const offset = sub(body, earth);
      const distance = Math.hypot(offset.x, offset.y);
      if (distance === 0) {
        points.push(earthPoint);
        continue;
      }
      // The same cap the marker uses, or the trail would part company with it.
      const mercury = sample.positions.get('mercury');
      const radius = moonDrawnRadius(
        distance,
        mercury
          ? (() => {
              const m = projectVector(sub(mercury, origin), scaleMode);
              return Math.hypot(m.x - earthPoint.x, m.y - earthPoint.y);
            })()
          : null,
      );
      points.push({
        x: earthPoint.x + (offset.x / distance) * radius,
        y: earthPoint.y + (offset.y / distance) * radius,
      });
      continue;
    }

    points.push(projectVector(sub(body, origin), scaleMode));
  }

  return points;
}

// --- construction ("the harness") ---------------------------------------

export interface ProjectedConstruction {
  /**
   * Closed curves, already flattened to polylines — circles and ellipses alike,
   * since after sampling and projection nothing distinguishes them but the role
   * they carry.
   */
  curves: { points: Point[]; role: ConstructionRole }[];
  arms: { from: Point; to: Point; role: ConstructionRole }[];
  markers: { at: Point; role: ConstructionRole }[];
}

/** How finely construction curves are sampled. */
const CIRCLE_SAMPLES = 72;

/**
 * Project a point given in engine space.
 *
 * The Moon needs its own rule, mirroring the exaggeration its marker gets: its
 * real deferent is 0.0026 AU across and would otherwise be drawn a hundred
 * times smaller than the Moon it is supposed to carry. The mapping is linear in
 * distance from Earth, so circles about Earth stay circles.
 */
function constructionProjector(
  state: State,
  bodyId: BodyId,
  positions: PositionSet,
): (point: Vec3) => Point {
  const origin = positions.get(state.frameOrigin)!;

  if (bodyId !== 'moon') {
    return (point) => projectVector(sub(point, origin), state.scaleMode);
  }

  const earth = positions.get('earth')!;
  const earthPoint = projectVector(sub(earth, origin), state.scaleMode);

  return (point) => {
    const offset = sub(point, earth);
    const distance = Math.hypot(offset.x, offset.y);
    if (distance === 0) return earthPoint;
    const mercury = positions.get('mercury');
    const radius = moonDrawnRadius(
      distance,
      mercury
        ? (() => {
            const m = projectVector(sub(mercury, origin), state.scaleMode);
            return Math.hypot(m.x - earthPoint.x, m.y - earthPoint.y);
          })()
        : null,
    );
    return {
      x: earthPoint.x + (offset.x / distance) * radius,
      y: earthPoint.y + (offset.y / distance) * radius,
    };
  };
}

/**
 * The active engine's machinery for one body, ready to draw.
 *
 * Circles are sampled into polylines rather than emitted as centre-and-radius,
 * because the compressed scale is nonlinear: a circle that is not centred on
 * the frame origin does not project to a circle, and a deferent drawn as a true
 * circle would sit visibly off its own planet.
 */
export function buildConstruction(
  state: State,
  bodyId: BodyId,
): ProjectedConstruction | null {
  const engine = ENGINES[state.engineId];
  if (!engine.construction) return null;

  const construction = engine.construction(state.julianDate, bodyId);
  if (!construction) return null;

  const positions = engine.positionsAt(state.julianDate);
  const project = constructionProjector(state, bodyId, positions);

  const circles = construction.circles.map(({ centre, radius, role }) => {
    const points: Point[] = [];
    for (let i = 0; i <= CIRCLE_SAMPLES; i++) {
      const angle = (i / CIRCLE_SAMPLES) * Math.PI * 2;
      points.push(
        project(
          vec3(centre.x + Math.cos(angle) * radius, centre.y + Math.sin(angle) * radius, centre.z),
        ),
      );
    }
    return { points, role };
  });

  // Sampled the same way and into the same array: the projection is nonlinear,
  // so an ellipse would not survive as an ellipse any more than a circle
  // survives as a circle. Both become polylines and are drawn as such.
  const ellipses = (construction.ellipses ?? []).map(
    ({ centre, majorAxis, minorAxis, role }) => {
      const points: Point[] = [];
      for (let i = 0; i <= CIRCLE_SAMPLES; i++) {
        const angle = (i / CIRCLE_SAMPLES) * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        points.push(
          project(
            vec3(
              centre.x + majorAxis.x * cos + minorAxis.x * sin,
              centre.y + majorAxis.y * cos + minorAxis.y * sin,
              centre.z + majorAxis.z * cos + minorAxis.z * sin,
            ),
          ),
        );
      }
      return { points, role };
    },
  );

  return {
    curves: [...circles, ...ellipses],
    arms: construction.arms.map(({ from, to, role }) => ({
      from: project(from),
      to: project(to),
      role,
    })),
    markers: construction.markers.map(({ at, role }) => ({ at: project(at), role })),
  };
}

// --- Newton's machinery: force and velocity vectors ---------------------

export type VectorRole = 'velocity' | 'net-force' | 'gravity';

export interface ProjectedVector {
  from: Point;
  to: Point;
  role: VectorRole;
  /** Which body pulls, for gravity vectors. */
  source?: BodyId;
  /** Physical size: newtons for forces, km/s for velocity. */
  magnitude: number;
}

/** Screen length given to the strongest pull, in map-radius units. */
const MAX_FORCE_LENGTH = 0.3;
/** Shortest a pull may be drawn, so the weak ones remain findable. */
const MIN_FORCE_LENGTH = 0.022;

/**
 * Exponent compressing the range of drawn force lengths.
 *
 * The Sun accounts for over 98% of the pull on Earth, so proportional lengths
 * would render every other vector as a sub-pixel nub — the display would say
 * only "the Sun wins", which the numbers in the panel say better. A fourth-root
 * turns a 20,000:1 spread into about 12:1, keeping Jupiter's tug visible.
 *
 * Lengths are therefore *ordered* but not proportional, and the UI says so. The
 * exact figures live in the info panel.
 */
const FORCE_COMPRESSION = 0.25;

/** Earth's mean orbital speed, km/s — the yardstick for velocity arrows. */
const REFERENCE_SPEED_KM_S = 29.78;
const REFERENCE_SPEED_LENGTH = 0.25;

/**
 * Direction of an engine-space vector, as drawn.
 *
 * The projection is radial about the frame origin and therefore not
 * angle-preserving, so a vector's screen direction is found by projecting a
 * short step along it and differencing — a local linearisation rather than
 * projecting the direction itself, which would be wrong wherever the scale is
 * compressed.
 */
function screenDirection(
  project: (point: Vec3) => Point,
  origin: Vec3,
  direction: Vec3,
  step = 0.01,
): Point {
  const base = project(origin);
  const ahead = project({
    x: origin.x + direction.x * step,
    y: origin.y + direction.y * step,
    z: origin.z + direction.z * step,
  });
  const dx = ahead.x - base.x;
  const dy = ahead.y - base.y;
  const size = Math.hypot(dx, dy);
  if (size === 0) return { x: 1, y: 0 };
  return { x: dx / size, y: dy / size };
}

/**
 * Velocity and gravitational pulls on a body, ready to draw.
 *
 * This is Newton's answer to the deferent and the epicycle: he places a body by
 * force, so the machinery to show is a set of vectors rather than a set of
 * circles.
 */
export function buildDynamicsView(
  state: State,
  bodyId: BodyId,
): ProjectedVector[] | null {
  const engine = ENGINES[state.engineId];
  if (!engine.dynamics) return null;

  const dynamics = engine.dynamics(state.julianDate, bodyId);
  if (!dynamics) return null;

  const positions = engine.positionsAt(state.julianDate);
  const anchor = positions.get(bodyId);
  if (!anchor) return null;

  const project = constructionProjector(state, bodyId, positions);
  const from = project(anchor);
  const vectors: ProjectedVector[] = [];

  const push = (
    direction: Vec3,
    lengthUnits: number,
    role: VectorRole,
    magnitude: number,
    source?: BodyId,
  ): void => {
    const screen = screenDirection(project, anchor, direction);
    vectors.push({
      from,
      to: { x: from.x + screen.x * lengthUnits, y: from.y + screen.y * lengthUnits },
      role,
      source,
      magnitude,
    });
  };

  const strongest = dynamics.pulls[0]?.newtons ?? 0;

  for (const pull of dynamics.pulls) {
    const ratio = strongest === 0 ? 0 : pull.newtons / strongest;
    const lengthUnits = Math.max(
      MIN_FORCE_LENGTH,
      MAX_FORCE_LENGTH * ratio ** FORCE_COMPRESSION,
    );
    push(pull.direction, lengthUnits, 'gravity', pull.newtons, pull.source);
  }

  // The resultant, drawn last so it sits over the contributions it sums.
  if (dynamics.netNewtons > 0) {
    push(dynamics.netDirection, MAX_FORCE_LENGTH, 'net-force', dynamics.netNewtons);
  }

  if (dynamics.speedKmPerSecond > 0) {
    const speedLength =
      (dynamics.speedKmPerSecond / REFERENCE_SPEED_KM_S) * REFERENCE_SPEED_LENGTH;
    push(
      dynamics.velocity,
      speedLength,
      'velocity',
      dynamics.speedKmPerSecond,
    );
  }

  return vectors;
}

/** Where a body's sight-line meets the zodiac ring, in map-radius units. */
export function ringIntercept(longitudeDeg: number, ringRadius: number): Point {
  return {
    x: Math.cos(longitudeDeg * DEG) * ringRadius,
    y: Math.sin(longitudeDeg * DEG) * ringRadius,
  };
}
