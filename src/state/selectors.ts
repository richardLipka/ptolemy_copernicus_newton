/**
 * Derived view data: everything the renderer needs, in geometry-free form.
 *
 * Screen coordinates are expressed in units of the map radius, so 1.0 is the
 * edge of the plan view and the zodiac ring sits just beyond it. CSS multiplies
 * by the real pixel radius, which keeps the layer resolution-independent and
 * means a resize needs no recomputation.
 */

import { BODIES, BODY_IDS, type BodyId } from '../core/bodies';
import type { ConstructionRole } from '../core/construction';
import { apparentLongitude, relativePosition } from '../core/coordinates';
import type { PositionSet } from '../core/engines/types';
import { recenter } from '../core/frame';
import { illuminationOf, type Illumination } from '../core/illumination';
import { DEG, length, sub, vec3, type Vec3 } from '../core/vec';
import { locate, type ZodiacPosition } from '../core/zodiac';
import type { ScaleMode, State } from './store';
import { ENGINES } from './store';

export interface Point {
  x: number;
  y: number;
}

/** Outer edge of the modelled system, AU. Saturn's aphelion with headroom. */
const SYSTEM_RADIUS_AU = 10.1;

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
 * orbit is drawn at a fixed exaggerated radius that breathes with the real
 * distance. This is the one place the map knowingly lies about a distance, and
 * it lies the same way every orrery ever built has.
 */
const MOON_ORBIT_RADIUS = 0.055;
const MOON_MEAN_DISTANCE_AU = 0.00257;

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
    const offset = sub(centred.get('moon')!, centred.get('earth')!);
    const distance = Math.hypot(offset.x, offset.y);
    const radius = MOON_ORBIT_RADIUS * (distance / MOON_MEAN_DISTANCE_AU);
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

export interface OrreryView {
  bodies: BodyView[];
  /** Faint comparison model, if one is selected. */
  ghosts: Map<BodyId, Point>;
  observerPoint: Point;
  positions: PositionSet;
}

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

  const ghosts = new Map<BodyId, Point>();
  if (state.ghostEngineId) {
    const ghostPositions = ENGINES[state.ghostEngineId].positionsAt(state.julianDate);
    for (const [id, point] of projectPositions(
      ghostPositions,
      state.frameOrigin,
      state.scaleMode,
    )) {
      ghosts.set(id, point);
    }
  }

  return {
    bodies,
    ghosts,
    observerPoint: projected.get(state.observationPoint) ?? { x: 0, y: 0 },
    positions,
  };
}

/**
 * Trace every body's path in a single pass.
 *
 * Tracing rather than drawing an idealised ellipse is what lets an arbitrary
 * stationary point work: centre the map on Earth and Mars produces the looping
 * rosette that Ptolemy needed epicycles to reproduce, without a line of code
 * that knows what a retrograde loop is.
 *
 * Bodies are traced together, in ascending date order, because the n-body
 * engine integrates to reach a date. Tracing them one at a time would send it
 * seeking back and forth across centuries once per body; walking a single
 * sorted timeline lets it sweep the span once.
 */
export function traceAllPaths(
  state: State,
  // Enough to resolve the three retrograde loops a non-heliocentric path
  // shows, at ~40 points each, without putting a thousand extra elements on
  // the page.
  samplesPerBody = 120,
): Map<BodyId, Point[]> {
  const engine = ENGINES[state.engineId];

  const wanted: { jd: number; id: BodyId; index: number }[] = [];
  const paths = new Map<BodyId, Point[]>();

  for (const id of BODY_IDS) {
    if (id === state.frameOrigin) continue;
    const span = pathSpanDays(id, state.frameOrigin);
    const start = state.julianDate - span / 2;
    const step = span / (samplesPerBody - 1);

    paths.set(id, new Array<Point>(samplesPerBody));
    for (let i = 0; i < samplesPerBody; i++) {
      wanted.push({ jd: start + step * i, id, index: i });
    }
  }

  wanted.sort((a, b) => a.jd - b.jd);

  let lastJd = Number.NaN;
  let projected: Map<BodyId, Point> | null = null;

  for (const { jd, id, index } of wanted) {
    if (jd !== lastJd || !projected) {
      projected = projectPositions(
        engine.positionsAt(jd),
        state.frameOrigin,
        state.scaleMode,
      );
      lastJd = jd;
    }
    const point = projected.get(id);
    if (point) paths.get(id)![index] = point;
  }

  return paths;
}

/** Orbital period about the Sun, days. The Moon's is Earth's, since that is
 *  what governs its motion relative to anything other than Earth. */
function orbitalPeriodDays(id: BodyId): number {
  if (id === 'moon') return 365.25;
  const rate = BODIES[id].orbit?.rates.L;
  return rate ? (360 / rate) * 36525 : 365.25;
}

/** How many loops a non-closing path is drawn for. */
const RETROGRADE_LOOPS_SHOWN = 3;

/**
 * How much time a body's traced path should span.
 *
 * Centred on the Sun, one orbital period closes the curve exactly. Centred on
 * anything else it generally never closes, and the right unit is the *synodic*
 * period — the interval between successive alignments, which is what sets the
 * spacing of the retrograde loops.
 *
 * Using the orbital period there instead is what turns the map into a ball of
 * wool: Saturn seen from Earth completes a loop every 378 days, so its 29-year
 * orbit contains 57 of them, far more than a sampled path can resolve or an
 * eye can read. Three loops shows the pattern.
 */
function pathSpanDays(bodyId: BodyId, frameOrigin: BodyId): number {
  // A satellite about its own primary closes in one orbit, like a planet
  // about the Sun.
  if (BODIES[bodyId].parent === frameOrigin) return 27.321661;
  if (frameOrigin === 'sun') return orbitalPeriodDays(bodyId);
  // The Sun's apparent circuit takes exactly the observer's own year.
  if (bodyId === 'sun') return orbitalPeriodDays(frameOrigin);

  const bodyPeriod = orbitalPeriodDays(bodyId);
  const originPeriod = orbitalPeriodDays(frameOrigin);
  if (bodyPeriod === originPeriod) return bodyPeriod;

  const synodic = Math.abs(1 / (1 / bodyPeriod - 1 / originPeriod));
  return synodic * RETROGRADE_LOOPS_SHOWN;
}

// --- construction ("the harness") ---------------------------------------

export interface ProjectedConstruction {
  circles: { points: Point[]; role: ConstructionRole }[];
  arms: { from: Point; to: Point; role: ConstructionRole }[];
  markers: { at: Point; role: ConstructionRole }[];
}

/** How finely construction circles are sampled. */
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
    const radius = MOON_ORBIT_RADIUS * (distance / MOON_MEAN_DISTANCE_AU);
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

  return {
    circles: construction.circles.map(({ centre, radius, role }) => {
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
    }),
    arms: construction.arms.map(({ from, to, role }) => ({
      from: project(from),
      to: project(to),
      role,
    })),
    markers: construction.markers.map(({ at, role }) => ({ at: project(at), role })),
  };
}

/** Where a body's sight-line meets the zodiac ring, in map-radius units. */
export function ringIntercept(longitudeDeg: number, ringRadius: number): Point {
  return {
    x: Math.cos(longitudeDeg * DEG) * ringRadius,
    y: Math.sin(longitudeDeg * DEG) * ringRadius,
  };
}
