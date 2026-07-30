/**
 * The Ptolemaic system, in two sub-modes.
 *
 * `reframe` takes the accurate Keplerian positions and expresses them with
 * Earth at the origin. That is *what Ptolemy was approximating*: retrograde
 * loops appear with no epicycle machinery at all, because they were never
 * anything but the parallax of a moving observer.
 *
 * `epicyclic` is *what Ptolemy actually built* — deferent, eccentric, equant
 * and epicycle, with Almagest parameters. Its positions carry his real error.
 *
 * Running the two against each other is the app's sharpest lesson, because of
 * an equivalence visible in the parameters themselves. Ptolemy's epicycle-to-
 * deferent ratio r/R equals, for a superior planet, 1/a — and for an inferior
 * planet, a — where a is the modern heliocentric semi-major axis:
 *
 *     Mars    39.5/60 = 0.658   vs  1/1.524 = 0.656
 *     Jupiter 11.5/60 = 0.192   vs  1/5.202 = 0.192
 *     Venus   43.17/60 = 0.720  vs      0.723
 *     Mercury 22.5/60 = 0.375   vs      0.387
 *
 * That is not a coincidence and it is not a fudge. Geocentric position is
 * r_planet - r_earth either way; Ptolemy simply assigned one of those two
 * vectors to the deferent and the other to the epicycle. For a superior planet
 * the epicycle *is* Earth's orbit; for an inferior planet the deferent is.
 * His epicycles encode the heliocentric distances he did not believe in.
 */

import { AU_IN_KM, BODIES, type BodyId } from '../bodies';
import type { Construction } from '../construction';
import { centuriesSinceJ2000 } from '../time';
import { DEG, add, scale, sub, vec3, type Vec3 } from '../vec';
import { elementsAt, keplerianPositions } from './keplerian';
import type { Engine, PositionSet } from './types';

// --- Sub-mode 1: Earth-centred reframe ----------------------------------

export function ptolemaicReframePositions(jd: number): Map<BodyId, Vec3> {
  const heliocentric = keplerianPositions(jd);
  const earth = heliocentric.get('earth')!;

  const geocentric = new Map<BodyId, Vec3>();
  for (const [id, position] of heliocentric) {
    geocentric.set(id, sub(position, earth));
  }
  return geocentric;
}

export const ptolemaicReframeEngine: Engine = {
  id: 'ptolemaic-reframe',
  positionsAt: (jd: number): PositionSet => ptolemaicReframePositions(jd),
};

// --- Sub-mode 2: authentic epicyclic construction ------------------------

/**
 * Almagest parameters. Distances are in Ptolemy's own units of a deferent
 * radius of 60; he had no absolute scale, so the engine anchors each orbit as
 * described in `deferentRadiusAu`.
 */
interface AlmagestModel {
  /** Tropical longitude of the apogee at the Almagest epoch, degrees. */
  apogee: number;
  /** Earth's offset from the deferent centre, in units of R = 60. */
  eccentricity: number;
  /** Epicycle radius, in units of R = 60. */
  epicycleRadius: number;
  kind: 'superior' | 'inferior';
}

/**
 * Ptolemy's apogees were fixed against the stars and precessed with the
 * equinox in his tropical coordinates. This app works in the J2000 ecliptic,
 * a star-fixed frame, so each apogee is a constant here — shifted once by the
 * real precession accumulated between the Almagest epoch (~137 AD) and J2000,
 * about 1863 years at 1.396 deg/century.
 *
 * Note this uses the *true* precession rate, not Ptolemy's own value of
 * 1 deg/century. His rate was wrong, but correcting for it here isolates the
 * error that this engine exists to show — the geometry of eccentric-plus-
 * equant against a real ellipse — from a separate error in his star catalogue.
 */
const APOGEE_PRECESSION_TO_J2000 = 26.0;

const ALMAGEST: Partial<Record<BodyId, AlmagestModel>> = {
  mercury: { apogee: 190.0, eccentricity: 3.0, epicycleRadius: 22.5, kind: 'inferior' },
  venus: { apogee: 55.0, eccentricity: 1.25, epicycleRadius: 43.17, kind: 'inferior' },
  mars: { apogee: 115.5, eccentricity: 6.0, epicycleRadius: 39.5, kind: 'superior' },
  jupiter: { apogee: 161.0, eccentricity: 2.75, epicycleRadius: 11.5, kind: 'superior' },
  saturn: { apogee: 233.0, eccentricity: 3.4167, epicycleRadius: 6.5, kind: 'superior' },
};

/** Ptolemy's solar model: an eccentric circle, no equant. */
const SOLAR_APOGEE = 65.5;
const SOLAR_ECCENTRICITY = 2.5;

/** Ptolemy's simple (Hipparchan) lunar model: concentric deferent, epicycle
 *  of radius 5;15. The crank that Ptolemy later added to fit the quadratures
 *  is not implemented — see CLAUDE.md §12.4. */
const LUNAR_EPICYCLE_RADIUS = 5.25;
const LUNAR_DEFERENT_KM = 385_000.56;

/**
 * Deferent radii from Ptolemy's nested spheres.
 *
 * The Almagest fixes only the *ratio* r/R for each planet; the absolute size of
 * each deferent is free, because a direction seen from Earth is unchanged when a
 * planet's deferent, eccentricity and epicycle are all scaled together. Ptolemy
 * settled the scale separately, in the Planetary Hypotheses, with a cosmological
 * argument: the heavens contain no gaps, so each planet's shell begins exactly
 * where the one below it ends.
 *
 * That ordering — Moon, Mercury, Venus, Sun, Mars, Jupiter, Saturn — is what
 * makes the model a physical claim rather than a calculating device, and it is
 * the part Galileo overturned. It has two consequences visible here that the
 * angular construction alone does not produce:
 *
 *   - Mercury and Venus lie *always* between Earth and the Sun, so they can
 *     never show more than a half-lit disc.
 *   - The superior planets lie always beyond the Sun, so Mars can never come
 *     nearer than the Sun does.
 *
 * The shells are chained outward from the Sun rather than inward from the Moon.
 * Ptolemy's own chain started at the Moon and, with his roughly correct lunar
 * distance, put the Sun at some 1210 Earth radii — about a nineteenth of the
 * truth. Anchoring on the Sun keeps this model comparable with the other two,
 * which is the whole point of the app, and costs only the Moon's shell, whose
 * distance is already exaggerated for display.
 */
function nestedDeferentRadii(): Partial<Record<BodyId, number>> {
  const radii: Partial<Record<BodyId, number>> = {};

  /*
   * Half-thickness of a shell, as a fraction of its deferent radius.
   *
   * The epicycle is not the only thing that widens a shell: the deferent is
   * eccentric, so its centre sits a distance e from Earth and the epicycle's own
   * centre already ranges over R ± e. Both terms must be counted, or the shells
   * overlap — leaving Mars nearer than the Sun on some days, which is precisely
   * what the nesting is supposed to forbid.
   */
  const halfThickness = (id: BodyId): number =>
    (ALMAGEST[id]!.epicycleRadius + ALMAGEST[id]!.eccentricity) / 60;

  // Inward from the Sun's inner surface: Venus, then Mercury below it.
  let boundary = 1 - SOLAR_ECCENTRICITY / 60;
  for (const id of ['venus', 'mercury'] as BodyId[]) {
    const half = halfThickness(id);
    const deferent = boundary / (1 + half);
    radii[id] = deferent;
    boundary = deferent * (1 - half);
  }

  // Outward from the Sun's outer surface: Mars, Jupiter, Saturn.
  boundary = 1 + SOLAR_ECCENTRICITY / 60;
  for (const id of ['mars', 'jupiter', 'saturn'] as BodyId[]) {
    const half = halfThickness(id);
    const deferent = boundary / (1 - half);
    radii[id] = deferent;
    boundary = deferent * (1 + half);
  }

  return radii;
}

const NESTED_DEFERENT = nestedDeferentRadii();

const apogeeInJ2000Frame = (almagestApogee: number): number =>
  almagestApogee + APOGEE_PRECESSION_TO_J2000;

/** Mean longitude of a body in the J2000 ecliptic frame, degrees. */
const meanLongitude = (jd: number, id: BodyId): number =>
  elementsAt(jd, BODIES[id].orbit!).L;

/** Mean longitude of the Sun as seen from Earth. */
const meanSolarLongitude = (jd: number): number => meanLongitude(jd, 'earth') + 180;

/**
 * Place the epicycle centre on the deferent.
 *
 * Earth sits at the origin, offset from the deferent centre by `eccentricity`.
 * The equant lies the same distance again beyond the centre, and it is about
 * the equant — not the centre, and not Earth — that the epicycle centre sweeps
 * equal angles in equal times. That device is Ptolemy's real insight: it
 * reproduces, to first order, the varying speed that Kepler's second law
 * describes exactly.
 */
function deferentPoint(
  radius: number,
  eccentricity: number,
  apogee: number,
  uniformAngle: number,
): Vec3 {
  const apogeeRad = apogee * DEG;
  const equant = vec3(
    2 * eccentricity * Math.cos(apogeeRad),
    2 * eccentricity * Math.sin(apogeeRad),
    0,
  );

  const rayAngle = (apogee + uniformAngle) * DEG;
  const ray = vec3(Math.cos(rayAngle), Math.sin(rayAngle), 0);

  // Intersect the ray from the equant with the deferent circle. The equant is
  // offset from the centre by `eccentricity` along the apogee direction, so
  // the quadratic reduces to this using cos of the angle between them.
  const cosAngle = Math.cos(uniformAngle * DEG);
  const distance =
    -eccentricity * cosAngle +
    Math.sqrt(
      eccentricity * eccentricity * cosAngle * cosAngle -
        eccentricity * eccentricity +
        radius * radius,
    );

  return add(equant, scale(ray, distance));
}

const unitAtLongitude = (longitudeDeg: number): Vec3 =>
  vec3(Math.cos(longitudeDeg * DEG), Math.sin(longitudeDeg * DEG), 0);

/**
 * Every part of one body's construction, not just where it ends up.
 *
 * The engine works these out anyway; returning them lets the view draw the
 * machinery rather than only its product.
 */
export interface PtolemaicGeometry {
  deferentCentre: Vec3;
  deferentRadius: number;
  /** Absent for the Sun, whose motion Ptolemy took to be uniform about the centre. */
  equant: Vec3 | null;
  epicycleCentre: Vec3;
  /** Zero for the Sun, which has no epicycle. */
  epicycleRadius: number;
  /** Longitude of the apogee in the J2000 frame, degrees. */
  apogee: number;
  position: Vec3;
}

/** Ptolemy's Sun: uniform motion on a circle whose centre is offset from Earth. */
function ptolemaicSunGeometry(jd: number): PtolemaicGeometry {
  const radius = 1;
  const eccentricity = (SOLAR_ECCENTRICITY / 60) * radius;
  const apogee = apogeeInJ2000Frame(SOLAR_APOGEE);
  const anomaly = meanSolarLongitude(jd) - apogee;

  const centre = scale(unitAtLongitude(apogee), eccentricity);
  const position = add(centre, scale(unitAtLongitude(apogee + anomaly), radius));

  return {
    deferentCentre: centre,
    deferentRadius: radius,
    equant: null,
    epicycleCentre: position,
    epicycleRadius: 0,
    apogee,
    position,
  };
}

function ptolemaicPlanetGeometry(
  jd: number,
  id: BodyId,
  model: AlmagestModel,
): PtolemaicGeometry {
  const apogee = apogeeInJ2000Frame(model.apogee);

  // Ptolemy fixed only the ratio r/R; the scale comes from his nested spheres.
  // Scaling all three together leaves the direction from Earth untouched, so
  // this changes the model's distances without touching a single longitude.
  const deferentRadius = NESTED_DEFERENT[id]!;
  const epicycleRadius = deferentRadius * (model.epicycleRadius / 60);
  const eccentricity = deferentRadius * (model.eccentricity / 60);

  // A superior planet's deferent carries its own mean motion and its epicycle
  // vector stays parallel to Earth-Sun. An inferior planet's deferent tracks
  // the mean Sun while its epicycle carries the planet's motion. Those are the
  // two halves of r_planet - r_earth, assigned the opposite way round.
  const deferentAngle =
    model.kind === 'superior' ? meanLongitude(jd, id) : meanSolarLongitude(jd);
  const epicycleAngle =
    model.kind === 'superior' ? meanSolarLongitude(jd) : meanLongitude(jd, id);

  const centre = deferentPoint(
    deferentRadius,
    eccentricity,
    apogee,
    deferentAngle - apogee,
  );

  return {
    deferentCentre: scale(unitAtLongitude(apogee), eccentricity),
    deferentRadius,
    equant: scale(unitAtLongitude(apogee), 2 * eccentricity),
    epicycleCentre: centre,
    epicycleRadius,
    apogee,
    position: add(centre, scale(unitAtLongitude(epicycleAngle), epicycleRadius)),
  };
}

/** Ptolemy's simple lunar model: a concentric deferent with a retrograde epicycle. */
function ptolemaicMoonGeometry(jd: number): PtolemaicGeometry {
  const t = centuriesSinceJ2000(jd);
  const longitude = 218.3164477 + 481_267.88123421 * t - 0.0015786 * t * t;
  const anomaly = 134.9633964 + 477_198.8675055 * t + 0.0087414 * t * t;

  const deferentRadius = LUNAR_DEFERENT_KM / AU_IN_KM;
  const epicycleRadius = deferentRadius * (LUNAR_EPICYCLE_RADIUS / 60);

  const centre = scale(unitAtLongitude(longitude), deferentRadius);
  // The Moon runs backwards round its epicycle, sitting nearest Earth at
  // perigee. This reproduces the 5 degree equation of centre Hipparchus
  // measured from eclipses.
  const onEpicycle = unitAtLongitude(longitude + 180 - anomaly);

  return {
    deferentCentre: vec3(0, 0, 0),
    deferentRadius,
    equant: null,
    epicycleCentre: centre,
    epicycleRadius,
    apogee: longitude,
    position: add(centre, scale(onEpicycle, epicycleRadius)),
  };
}

/** Full construction for one body, or null where the engine has none. */
export function ptolemaicGeometryFor(
  jd: number,
  id: BodyId,
): PtolemaicGeometry | null {
  if (id === 'earth') return null;
  if (id === 'sun') return ptolemaicSunGeometry(jd);
  if (id === 'moon') return ptolemaicMoonGeometry(jd);

  const model = ALMAGEST[id];
  return model ? ptolemaicPlanetGeometry(jd, id, model) : null;
}

export function ptolemaicConstruction(jd: number, id: BodyId): Construction | null {
  const geometry = ptolemaicGeometryFor(jd, id);
  if (!geometry) return null;

  const construction: Construction = {
    circles: [
      {
        centre: geometry.deferentCentre,
        radius: geometry.deferentRadius,
        role: 'deferent',
      },
    ],
    arms: [],
    markers: [],
  };

  // The apsidal line: the axis the whole eccentric arrangement is built along.
  const apsidalArm = scale(unitAtLongitude(geometry.apogee), geometry.deferentRadius);
  construction.arms.push({
    from: sub(geometry.deferentCentre, apsidalArm),
    to: add(geometry.deferentCentre, apsidalArm),
    role: 'apsidal',
  });

  // The arm sweeps from the equant where there is one, because that is the
  // point the motion is uniform about — drawing it from the centre would hide
  // exactly what the equant was invented to do.
  construction.arms.push({
    from: geometry.equant ?? geometry.deferentCentre,
    to: geometry.epicycleCentre,
    role: 'deferent-arm',
  });

  if (geometry.epicycleRadius > 0) {
    construction.circles.push({
      centre: geometry.epicycleCentre,
      radius: geometry.epicycleRadius,
      role: 'epicycle',
    });
    construction.arms.push({
      from: geometry.epicycleCentre,
      to: geometry.position,
      role: 'epicycle-arm',
    });
  }

  construction.markers.push({ at: geometry.deferentCentre, role: 'centre' });
  if (geometry.equant) {
    construction.markers.push({ at: geometry.equant, role: 'equant' });
  }

  return construction;
}

/**
 * Positions with Earth at the origin. Latitudes are zero: Ptolemy's theory of
 * latitude is a separate construction that this engine does not implement, and
 * the app reads longitudes only. See CLAUDE.md §12.4.
 */
export function ptolemaicEpicyclicPositions(jd: number): Map<BodyId, Vec3> {
  const positions = new Map<BodyId, Vec3>();
  positions.set('earth', vec3(0, 0, 0));
  positions.set('sun', ptolemaicSunGeometry(jd).position);
  positions.set('moon', ptolemaicMoonGeometry(jd).position);

  for (const [id, model] of Object.entries(ALMAGEST) as [BodyId, AlmagestModel][]) {
    positions.set(id, ptolemaicPlanetGeometry(jd, id, model).position);
  }

  return positions;
}

export const ptolemaicEpicyclicEngine: Engine = {
  id: 'ptolemaic-epicyclic',
  positionsAt: (jd: number): PositionSet => ptolemaicEpicyclicPositions(jd),
  construction: ptolemaicConstruction,
};
