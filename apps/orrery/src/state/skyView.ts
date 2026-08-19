/**
 * What is actually in that direction: the sky around the selected body, as seen
 * from the observation point.
 *
 * The map answers "where are the planets"; this answers the question an
 * observer could actually put to the sky — *look that way, and what is there?*
 * They are not the same question, and the whole history in this app turns on the
 * difference. Nobody ever saw a deferent. What they saw was Mars a degree from
 * Antares, written down against a star, night after night, and every model here
 * exists to account for a notebook of exactly that.
 *
 * The band is a **chart, not a window**. Longitude runs to the right and
 * ecliptic latitude upward, because the app models no horizon, no hour and no
 * place on the observing planet — without those, "left" and "right" in the sky
 * are undefined, and inventing them would be the one dishonest thing this view
 * could do. What it does show is exactly what the coordinates support: angular
 * separations, in a patch of sky drawn to a single scale.
 */

import { BODIES, BODY_IDS, type BodyId } from '@orrery/core/bodies';
import { relativePosition, type SphericalPosition } from '@orrery/core/coordinates';
import { ENGINES } from '@orrery/core/engines/registry';
import { illuminationOf, type Illumination } from '@orrery/core/illumination';
import { starsWithin } from '@orrery/core/stars';
import { DEG, angleDiffDeg, normalizeDeg } from '@orrery/core/vec';
import { divisionsFor, precessionSinceJ2000, type ZodiacDivision } from '@orrery/core/zodiac';
import type { State } from './store';

/** Anything drawn in the band carries the two angles that place it. */
export interface SkyMark {
  /** Degrees east of the field centre. Negative is west. */
  offset: number;
  /** Ecliptic latitude, degrees. Positive is north of the ecliptic. */
  latitude: number;
}

export interface SkyStarMark extends SkyMark {
  name: string;
  designation: string;
  magnitude: number;
}

export interface SkyBodyMark extends SkyMark {
  id: BodyId;
  /** Apparent ecliptic longitude, degrees — the figure the info panel gives. */
  longitude: number;
  /** Distance from the observer, AU. */
  distance: number;
  /** Phase as the observer sees it, so the band can draw the lit side. */
  illumination: Illumination;
  /** True angular distance from the body the field is centred on, degrees. */
  separation: number;
}

export interface SkyDivisionMark {
  id: string;
  /** Degrees east of the field centre where the division begins. */
  offset: number;
}

export interface SkyView {
  /** The body being looked at. */
  target: BodyId;
  observer: BodyId;
  /** Apparent longitude of the target: what the field is centred on. */
  centre: number;
  /**
   * And its latitude, which the band is centred on as well.
   *
   * Not the ecliptic. The band is shallow, and a body can be a long way off the
   * ecliptic — the Moon reaches five degrees, Mercury seven — so a band centred
   * on the ecliptic can leave the very body it was opened to look at outside
   * itself. Centring on the target puts it in the middle by construction, and
   * costs nothing: the ecliptic is still drawn, just no longer down the middle,
   * and every latitude reported is the real one.
   */
  centreLatitude: number;
  /** Full width of the field, degrees. */
  field: number;
  stars: SkyStarMark[];
  bodies: SkyBodyMark[];
  divisions: SkyDivisionMark[];
  /**
   * How far the centre of the field is from the Sun, degrees.
   *
   * Small means this patch of sky is only above the horizon while the Sun is,
   * which is what kept Mercury nearly unobservable and is a fact about the
   * observation rather than about the model. Copernicus is said never to have
   * seen it.
   */
  solarDistance: number;
  /**
   * Every body in the band sits exactly on the ecliptic.
   *
   * Which is not a rounding artefact but a property of the model running: the
   * Ptolemaic construction here has no latitude theory at all. The Almagest
   * treats latitude as a separate apparatus of tilted circles, built after the
   * longitudes and independent of them, and this app does not implement it — so
   * in that mode every planet lies on the line, and the band is where a reader
   * will notice. Said in the caption rather than left as a puzzle.
   */
  flatLatitudes: boolean;
}

/**
 * A little beyond the field, so a body does not appear out of nothing at the
 * edge of the band while the clock runs.
 */
const EDGE_MARGIN_DEG = 2;

/**
 * True angular separation between two directions, degrees.
 *
 * By `atan2` of the cross and dot products rather than by `acos` of the dot
 * alone, which is the textbook formula and is unusable here. Near zero the
 * cosine of a small angle is 1 minus something of order the angle squared, so
 * for directions a thousandth of a degree apart the difference vanishes into
 * the last bits of a double and `acos` returns noise — it reports a body
 * separated from itself by three thousandths of an arcsecond.
 *
 * That is precisely the case this view exists to show. A conjunction is two
 * bodies a fifth of a degree apart, the narrow field is there to watch one
 * open, and a separation that goes to noise at the interesting end would be
 * worthless. `atan2` of the two products is well conditioned at both ends.
 */
export function angularSeparation(a: SphericalPosition, b: SphericalPosition): number {
  const latA = a.latitude * DEG;
  const latB = b.latitude * DEG;
  const dLon = angleDiffDeg(a.longitude, b.longitude) * DEG;

  const cosLatA = Math.cos(latA);
  const cosLatB = Math.cos(latB);
  const sinLatA = Math.sin(latA);
  const sinLatB = Math.sin(latB);

  // Both directions in a frame where the first sits at longitude zero, which
  // leaves the difference in longitude as the only angle needed.
  const dot = sinLatA * sinLatB + cosLatA * cosLatB * Math.cos(dLon);
  const cross = Math.hypot(
    cosLatB * Math.sin(dLon),
    cosLatA * sinLatB - sinLatA * cosLatB * Math.cos(dLon),
  );

  return Math.atan2(cross, dot) / DEG;
}

/**
 * Which bodies are worth putting in the band.
 *
 * A moon appears only when its own system is being looked at, on the same
 * reasoning the map uses for their labels: from Earth the four Galileans sit
 * within a few thousandths of a degree of Jupiter, so at any field this band can
 * show they are five marks on one point. When Jupiter itself is the target they
 * are the entire interest.
 */
function bodiesWorthDrawing(state: State, target: BodyId): BodyId[] {
  const family = BODIES[target].satellite ? BODIES[target].parent : target;

  return BODY_IDS.filter((id) => {
    if (id === state.observationPoint) return false;
    const satellite = BODIES[id].satellite;
    return !satellite || BODIES[id].parent === family;
  });
}

/**
 * The patch of sky around the selected body, or null when there is nothing to
 * look at — no selection, or the selection is the place being observed from.
 */
export function buildSkyView(state: State, field: number): SkyView | null {
  const target = state.selectedBody;
  if (!target || target === state.observationPoint) return null;

  const positions = ENGINES[state.engineId].positionsAt(state.julianDate);
  const observer = state.observationPoint;

  const centrePosition = relativePosition(positions, observer, target);
  const centre = centrePosition.longitude;
  const centreLatitude = centrePosition.latitude;
  const halfWidth = field / 2 + EDGE_MARGIN_DEG;

  const bodies: SkyBodyMark[] = [];
  for (const id of bodiesWorthDrawing(state, target)) {
    const position = relativePosition(positions, observer, id);
    const offset = angleDiffDeg(position.longitude, centre);
    if (Math.abs(offset) > halfWidth) continue;

    bodies.push({
      id,
      offset,
      latitude: position.latitude,
      longitude: position.longitude,
      distance: position.distance,
      illumination: illuminationOf(positions, observer, id),
      separation: angularSeparation(position, centrePosition),
    });
  }

  // Farthest first, so the near ones are painted over them — and so the target
  // itself, which is what the reader came to look at, is rarely underneath
  // anything.
  bodies.sort((a, b) => b.distance - a.distance);

  const stars: SkyStarMark[] = starsWithin(centre, halfWidth).map((star) => ({
    name: star.name,
    designation: star.designation,
    magnitude: star.magnitude,
    offset: star.offset,
    latitude: star.latitude,
  }));

  /*
   * Sign boundaries, offset exactly as the ring offsets them.
   *
   * The signs are tropical and the band is in the fixed J2000 frame, so a
   * boundary drawn here is its tropical longitude carried back by the
   * precession accumulated since J2000 — the same figure, with the same sign,
   * that the ring and the longitude strip apply.
   */
  const precession =
    state.zodiacScheme === 'signs' ? -precessionSinceJ2000(state.julianDate) : 0;

  const divisions: SkyDivisionMark[] = [];
  for (const division of divisionsFor(state.zodiacScheme) as readonly ZodiacDivision[]) {
    const offset = angleDiffDeg(normalizeDeg(division.start + precession), centre);
    if (Math.abs(offset) <= halfWidth) divisions.push({ id: division.id, offset });
  }

  return {
    target,
    observer,
    centre,
    centreLatitude,
    field,
    flatLatitudes: bodies.length > 0 && bodies.every((body) => body.latitude === 0),
    stars,
    bodies,
    divisions,
    solarDistance: Math.abs(
      angularSeparation(centrePosition, relativePosition(positions, observer, 'sun')),
    ),
  };
}
