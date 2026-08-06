/**
 * The Copernican system as *De revolutionibus* actually describes it.
 *
 * This engine exists because the app spent a long time misrepresenting
 * Copernicus. The other Copernican engine here — `circular.ts` — puts every
 * planet on a circle centred on the Sun, moving uniformly, and the resulting
 * 26° error at Mars was being attributed to "Copernicus used circles instead of
 * ellipses". That conflates two quite different claims. Copernicus did use
 * circles rather than ellipses, which is true and matters. He emphatically did
 * *not* use **concentric** circles traversed uniformly; the bulk of
 * *De revolutionibus* is the machinery that avoids exactly that.
 *
 * What he built instead, and what this engine implements:
 *
 *   - An **eccentric deferent** — its centre displaced from the Sun toward
 *     aphelion, so the planet is nearer at one end of the orbit than the other.
 *   - A small **epicyclet** carrying the planet, turning at twice the mean
 *     anomaly. This is his replacement for Ptolemy's equant, which he rejected
 *     on the principle that a heavenly motion must be uniform about its own
 *     centre and not about some third point.
 *
 * He split the eccentricity between the two: the deferent centre sits 3/2·ae
 * from the Sun and the epicyclet has radius 1/2·ae. That is not an arbitrary
 * division — with those values the construction reproduces a Keplerian ellipse
 * **exactly to first order in e, in both coordinates**. Taking perihelion along
 * +x and M as the mean anomaly:
 *
 *     P  = −(3/2)ae·û(0) + a·û(M) + (1/2)ae·û(2M)
 *     x  = a[cos M − e(1 + sin²M)]
 *     y  = a[sin M + e sin M cos M]
 *
 * which is the ellipse's own first-order expansion. Copernicus's circles were a
 * far better approximation to an ellipse than a bare circle is, and the app's
 * headline comparison was unfair until this engine existed.
 *
 * **Parameters are modern; the geometry is his.** The same choice the epicyclic
 * Ptolemaic engine makes, and for the same reason: it isolates what the
 * *construction* achieves from what its author's measurements got wrong. His own
 * eccentricities and apsidal lines carried errors of their own, so the real
 * *Prutenic Tables* were worse than this. What this shows is the model at its
 * best, which is the fair thing to set against Ptolemy's geometry at its best.
 *
 * One thing deliberately not modelled: Copernicus referred the planetary orbits
 * to the **mean Sun**, the centre of Earth's orbit, rather than to the Sun
 * itself. It is his most-quoted idiosyncrasy and it makes no difference to
 * anything observable here — a geocentric direction is planet minus Earth, and a
 * shift applied to both cancels exactly.
 */

import {
  BODIES,
  ORBITING_BODY_IDS,
  AU_IN_KM,
  type BodyId,
  type KeplerianElements,
  type OrbitalModel,
} from '../bodies.js';
import type { Construction } from '../construction.js';
import { centuriesSinceJ2000 } from '../time.js';
import { DEG, add, sub, vec3, type Vec3 } from '../vec.js';
import { elementsAt, meanAnomalyAt, orbitalPlaneToEcliptic } from './keplerian.js';
import type { Engine, EngineId, PositionSet } from './types.js';
import { addSatellites } from '../satellites.js';

/**
 * Everything the construction needs, as data.
 *
 * Two kinds of thing are open here, and a reconstruction moves both. The
 * *shares* are how Copernicus divided the eccentricity between deferent and
 * epicyclet — his 3/2 and 1/2, the values that make the construction match an
 * ellipse to first order. The *orbits* are what a student actually solves for:
 * Copernicus's own method gets a planet's distance from greatest elongation for
 * an inferior planet, or from a pair of observations a synodic period apart for
 * a superior one, and the answer is an orbit to substitute here.
 */
export interface CopernicanParameters {
  /** Eccentric offset as a multiple of *ae*. */
  deferentShare: number;
  /** Epicyclet radius as a multiple of *ae*. */
  epicycletShare: number;
  /**
   * Orbits to use in place of the body table's. Absent bodies keep theirs, so a
   * reconstruction can replace one planet and leave the rest of the system
   * standing — which is how the fitting is actually done, one body at a time.
   */
  orbits?: Partial<Record<BodyId, OrbitalModel>>;
}

/** Copernicus's own division, from *De revolutionibus*. */
export const COPERNICAN_PARAMETERS: CopernicanParameters = {
  deferentShare: 1.5,
  epicycletShare: 0.5,
};

/** The orbit a parameter set puts on a body: its own, or the table's. */
const orbitFor = (id: BodyId, params: CopernicanParameters): OrbitalModel | undefined =>
  params.orbits?.[id] ?? BODIES[id].orbit;

/** The pieces of the construction, in the orbital plane. */
interface PlaneGeometry {
  /** Deferent centre, displaced toward aphelion. */
  centreX: number;
  centreY: number;
  /** Centre of the epicyclet, riding the deferent. */
  epicycleX: number;
  epicycleY: number;
  /** The planet itself, on the epicyclet. */
  x: number;
  y: number;
  deferentRadius: number;
  epicycletRadius: number;
}

/**
 * Lay out the deferent, the epicyclet and the planet, in the orbital plane with
 * perihelion along +x.
 */
function planeGeometry(
  el: KeplerianElements,
  meanAnomalyDeg: number,
  params: CopernicanParameters = COPERNICAN_PARAMETERS,
): PlaneGeometry {
  const { a, e } = el;
  const m = meanAnomalyDeg * DEG;

  const offset = params.deferentShare * a * e;
  const epicyclet = params.epicycletShare * a * e;

  // Toward aphelion, which is the −x direction when perihelion is +x.
  const centreX = -offset;
  const centreY = 0;

  const epicycleX = centreX + a * Math.cos(m);
  const epicycleY = centreY + a * Math.sin(m);

  // Twice the mean anomaly: at perihelion and aphelion alike the epicyclet
  // points back along +x, which is what puts the planet on the apsidal line at
  // a(1 − e) and a(1 + e) respectively.
  return {
    centreX,
    centreY,
    epicycleX,
    epicycleY,
    x: epicycleX + epicyclet * Math.cos(2 * m),
    y: epicycleY + epicyclet * Math.sin(2 * m),
    deferentRadius: a,
    epicycletRadius: epicyclet,
  };
}

/** Heliocentric position under the Copernican construction. */
export function copernicanHeliocentricAt(
  jd: number,
  model: OrbitalModel,
  params: CopernicanParameters = COPERNICAN_PARAMETERS,
): Vec3 {
  const el = elementsAt(jd, model);
  const geometry = planeGeometry(el, meanAnomalyAt(jd, model), params);
  return orbitalPlaneToEcliptic(geometry.x, geometry.y, el);
}

// --- the Moon -----------------------------------------------------------

/**
 * Mean lunar elements, enough to drive the same construction about Earth.
 *
 * Copernicus reworked the lunar model too, replacing Ptolemy's crank — the
 * device that swung the Moon's distance through nearly 2:1 and predicted an
 * apparent size change nobody had ever seen — with a second epicycle. The
 * eccentric-plus-epicyclet used here is in that spirit and free of the same
 * absurdity, which is the part worth showing.
 */
const MOON_SEMI_MAJOR_AU = 384_400 / AU_IN_KM;
const MOON_ECCENTRICITY = 0.0549;
const MOON_INCLINATION = 5.145;

function lunarElements(jd: number): { el: KeplerianElements; meanAnomaly: number } {
  const t = centuriesSinceJ2000(jd);
  const meanLongitude = 218.3164477 + 481_267.88123421 * t;
  const perigee = 83.3532465 + 4069.0137287 * t;
  const node = 125.0445479 - 1934.1362891 * t;

  return {
    el: {
      a: MOON_SEMI_MAJOR_AU,
      e: MOON_ECCENTRICITY,
      i: MOON_INCLINATION,
      L: meanLongitude,
      peri: perigee,
      node,
    },
    meanAnomaly: meanLongitude - perigee,
  };
}

export function copernicanMoonGeocentricAt(jd: number): Vec3 {
  const { el, meanAnomaly } = lunarElements(jd);
  const geometry = planeGeometry(el, meanAnomaly);
  return orbitalPlaneToEcliptic(geometry.x, geometry.y, el);
}

// --- engine -------------------------------------------------------------

export function copernicanPositions(
  jd: number,
  params: CopernicanParameters = COPERNICAN_PARAMETERS,
): Map<BodyId, Vec3> {
  const positions = new Map<BodyId, Vec3>();
  positions.set('sun', vec3(0, 0, 0));

  for (const id of ORBITING_BODY_IDS) {
    positions.set(id, copernicanHeliocentricAt(jd, orbitFor(id, params)!, params));
  }

  // No barycentre correction: Copernicus had no reason to make one, and the
  // Earth–Moon barycentre is not a concept his system contains.
  const earth = positions.get('earth')!;
  positions.set('moon', add(earth, copernicanMoonGeocentricAt(jd)));

  addSatellites(jd, positions);
  return positions;
}

/**
 * The machinery, for the harness.
 *
 * Set beside the Ptolemaic panel this is the comparison Copernicus wanted made:
 * an eccentric and one small circle, against a deferent, an eccentric, an equant
 * *and* a large epicycle. His system is genuinely simpler — the epicyclet here
 * is a fifth of the size of the epicycle Ptolemy needs — while giving up nothing
 * in accuracy. That, rather than any gain in precision, is the case
 * *De revolutionibus* actually makes.
 */
export function copernicanConstruction(
  jd: number,
  id: BodyId,
  params: CopernicanParameters = COPERNICAN_PARAMETERS,
): Construction | null {
  if (id === 'sun') return null;

  const isMoon = id === 'moon';
  const model = orbitFor(id, params);
  if (!isMoon && !model) return null;

  const { el, meanAnomaly } = isMoon
    ? lunarElements(jd)
    : { el: elementsAt(jd, model!), meanAnomaly: meanAnomalyAt(jd, model!) };

  const geometry = planeGeometry(el, meanAnomaly, params);
  const toEcliptic = (x: number, y: number): Vec3 => orbitalPlaneToEcliptic(x, y, el);

  // The Moon's construction hangs off Earth rather than off the Sun.
  const anchor = isMoon
    ? copernicanHeliocentricAt(jd, orbitFor('earth', params)!, params)
    : vec3(0, 0, 0);
  const about = (point: Vec3): Vec3 => add(anchor, point);

  const centre = toEcliptic(geometry.centreX, geometry.centreY);
  const epicycleCentre = toEcliptic(geometry.epicycleX, geometry.epicycleY);
  const planet = toEcliptic(geometry.x, geometry.y);

  const apsidalHalf = toEcliptic(el.a, 0);

  return {
    circles: [
      { centre: about(centre), radius: geometry.deferentRadius, role: 'deferent' },
      {
        centre: about(epicycleCentre),
        radius: geometry.epicycletRadius,
        role: 'epicycle',
      },
    ],
    arms: [
      // The line of apsides, through the Sun and the displaced centre.
      {
        from: about(add(centre, apsidalHalf)),
        to: about(sub(centre, apsidalHalf)),
        role: 'apsidal',
      },
      { from: about(centre), to: about(epicycleCentre), role: 'deferent-arm' },
      { from: about(epicycleCentre), to: about(planet), role: 'epicycle-arm' },
    ],
    markers: [
      // Displaced from the Sun: the whole point of an eccentric.
      { at: about(centre), role: 'centre' },
    ],
  };
}

export const copernicanEngine: Engine = {
  id: 'copernican',
  positionsAt: (jd: number): PositionSet => copernicanPositions(jd),
  construction: copernicanConstruction,
};

/**
 * An engine from an arbitrary parameter set — the Copernican counterpart to
 * `createPtolemaicEngine`.
 *
 * Substituting one fitted orbit and leaving the rest alone is the useful case:
 * it puts a student's Mars beside the received one in the same system, running
 * through the same construction, so the difference on the screen is the
 * difference in the numbers and nothing else.
 */
export function createCopernicanEngine(
  params: CopernicanParameters,
  id: EngineId = 'copernican',
): Engine {
  return {
    id,
    positionsAt: (jd: number): PositionSet => copernicanPositions(jd, params),
    construction: (jd: number, bodyId: BodyId): Construction | null =>
      copernicanConstruction(jd, bodyId, params),
  };
}
