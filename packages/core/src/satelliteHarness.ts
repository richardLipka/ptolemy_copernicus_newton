/**
 * A moon's orbit drawn in the machinery of whichever model is running.
 *
 * The moons' *positions* are the same under all four models, and that is not
 * laziness — no pre-1610 model contains them, so none of them derives a moon's
 * place. What changes when you switch model is where Jupiter is; the moons ride
 * along. `satellites.ts` says this at length and it still holds.
 *
 * The **harness** is a different question. It does not claim to be what Ptolemy
 * or Copernicus wrote about the Galileans; neither wrote anything, and one of
 * them was dead. It answers the counterfactual the app exists to put on screen:
 * *given this orbit, what would each model have drawn?* That is worth showing
 * precisely because the answer is so uneven. Every geometry here is derived from
 * one set of elements in `bodies.ts` — the same orbit each time, described four
 * ways.
 *
 * The uneven part is the lesson. A circle needs one number and gets the orbit
 * about 99.6% right, because these orbits really are nearly circular. The
 * eccentric-and-epicyclet reproduces it to first order in e with three. Kepler's
 * ellipse is exact and needs no epicycle at all. Newton draws the same conic but
 * has *derived* it, from a force along the radius, rather than fitted it — which
 * is why his figure carries a radius and no scaffolding.
 *
 * Everything is expressed about the primary, in the engine's own space, so the
 * satellite exaggeration in `constructionProjector` lands on it correctly.
 */

import { BODIES, type BodyId } from './bodies';
import type { Construction } from './construction';
import type { SatelliteOrbit } from './bodies';
import type { EngineId } from './engines/types';
import { J2000 } from './time';
import { DEG, add, vec3, type Vec3 } from './vec';

/** Copernicus's split of the eccentricity. Matches `engines/copernican.ts`. */
const DEFERENT_SHARE = 1.5;
const EPICYCLET_SHARE = 0.5;

/**
 * Map a point in the orbital plane — pericentre along +x — into the frame the
 * primary sits at the origin of.
 *
 * The same rotation `satelliteOffsetAt` applies, factored out so the harness
 * places a centre, a focus or an apsidal end in exactly the frame the marker is
 * already in. Written out rather than composed from matrices because it is a
 * pure rotation and this is the whole of it.
 */
export function satellitePlaneToPrimary(x: number, y: number, orbit: SatelliteOrbit): Vec3 {
  const argPeri = (orbit.peri - orbit.node) * DEG;
  const node = orbit.node * DEG;
  const inc = orbit.i * DEG;

  const cosW = Math.cos(argPeri);
  const sinW = Math.sin(argPeri);
  const cosN = Math.cos(node);
  const sinN = Math.sin(node);
  const cosI = Math.cos(inc);
  const sinI = Math.sin(inc);

  return vec3(
    (cosW * cosN - sinW * sinN * cosI) * x + (-sinW * cosN - cosW * sinN * cosI) * y,
    (cosW * sinN + sinW * cosN * cosI) * x + (-sinW * sinN + cosW * cosN * cosI) * y,
    sinW * sinI * x + cosW * sinI * y,
  );
}

/** Mean anomaly, degrees, on the same convention `satelliteOffsetAt` uses. */
function meanAnomalyDeg(jd: number, orbit: SatelliteOrbit): number {
  return (orbit.epochLongitude - orbit.peri + (360 / orbit.periodDays) * (jd - J2000)) % 360;
}

/**
 * Which family of machinery an engine draws with.
 *
 * `ptolemaic-reframe` is grouped with the plain circle deliberately: it is
 * modern positions in geocentric dress and exposes no construction of its own
 * for the planets either, so inventing an equant for it would be a fiction about
 * a mode whose whole point is that it has no machinery.
 */
function familyOf(engineId: EngineId): 'ptolemaic' | 'copernican' | 'kepler' | 'newton' | 'circle' {
  if (engineId === 'ptolemaic-epicyclic' || engineId === 'ptolemaic-almagest') return 'ptolemaic';
  if (engineId === 'copernican') return 'copernican';
  if (engineId === 'keplerian') return 'kepler';
  if (engineId === 'nbody') return 'newton';
  return 'circle';
}

/**
 * The selected model's machinery for one satellite, about `primary`.
 *
 * `body` is the satellite's actual drawn position, passed in rather than
 * recomputed so the arms always terminate on the marker the reader can see.
 */
export function satelliteHarness(
  jd: number,
  id: BodyId,
  engineId: EngineId,
  primary: Vec3,
  body: Vec3,
): Construction | null {
  const orbit = BODIES[id].satellite;
  if (!orbit) return null;

  const { a, e } = orbit;
  const about = (x: number, y: number): Vec3 =>
    add(primary, satellitePlaneToPrimary(x, y, orbit));

  const apsidal = (): { from: Vec3; to: Vec3 } => ({
    from: about(a * (1 - e), 0),
    to: about(-a * (1 + e), 0),
  });

  switch (familyOf(engineId)) {
    /*
     * One circle, centred on the planet, and the arm carrying the moon round it.
     *
     * The naive model's whole claim, and on these orbits a good one: the most
     * eccentric moon here is Titan at 0.029, so the circle is within 3% of the
     * truth and the other four are within 1%. Drawing it plainly is what makes
     * the later models' extra apparatus look like the answer to a real question
     * rather than decoration.
     */
    case 'circle':
      return {
        circles: [{ centre: primary, radius: a, role: 'deferent' }],
        arms: [{ from: primary, to: body, role: 'deferent-arm' }],
        markers: [{ at: primary, role: 'centre' }],
      };

    /*
     * Ptolemy's eccentric with an equant, as his solar model would have been
     * extended to a body like this: the planet displaced from the centre of its
     * own circle, and the motion uniform not about the centre but about a second
     * point as far again beyond it. The bisection is the device that makes the
     * thing work, and it is invisible in the finished orbit.
     *
     * No epicycle. In his planetary models the epicycle carries what we would
     * call the Earth's own orbit, and a moon seen from its planet has no such
     * term — the analogue here is the Sun's eccentric, not Mars's deferent.
     */
    case 'ptolemaic': {
      const centre = about(-a * e * 0.5, 0);
      const equant = about(-a * e, 0);
      const line = apsidal();
      return {
        circles: [{ centre, radius: a, role: 'deferent' }],
        arms: [
          { from: line.from, to: line.to, role: 'apsidal' },
          { from: centre, to: body, role: 'deferent-arm' },
        ],
        markers: [
          { at: centre, role: 'centre' },
          { at: equant, role: 'equant' },
        ],
      };
    }

    /*
     * Copernicus's replacement for the equant: an eccentric circle offset by
     * 3/2·ae, carrying a small epicyclet of 1/2·ae that turns at twice the mean
     * anomaly. Exact to first order in e, and free of the equant he objected to
     * on the ground that it made the motion non-uniform about its own centre.
     *
     * On a moon of Jupiter the epicyclet is minute — Io's is 0.4% of the
     * deferent — which is itself the point. The device is not doing much here
     * because there is not much for it to do.
     */
    case 'copernican': {
      const m = meanAnomalyDeg(jd, orbit) * DEG;
      const offset = DEFERENT_SHARE * a * e;
      const epicyclet = EPICYCLET_SHARE * a * e;

      const centreX = -offset;
      const epicycleX = centreX + a * Math.cos(m);
      const epicycleY = a * Math.sin(m);

      const centre = about(centreX, 0);
      const epicycleCentre = about(epicycleX, epicycleY);
      const line = apsidal();

      return {
        circles: [
          { centre, radius: a, role: 'deferent' },
          { centre: epicycleCentre, radius: epicyclet, role: 'epicycle' },
        ],
        arms: [
          { from: line.from, to: line.to, role: 'apsidal' },
          { from: centre, to: epicycleCentre, role: 'deferent-arm' },
          { from: epicycleCentre, to: body, role: 'epicycle-arm' },
        ],
        markers: [{ at: centre, role: 'centre' }],
      };
    }

    /*
     * Kepler: one ellipse, the planet on a focus, and nothing whatever on the
     * other. Both are marked, because the emptiness of the second focus is the
     * entire content of the first law and is invisible unless it is shown.
     */
    case 'kepler': {
      const semiMinor = a * Math.sqrt(1 - e * e);
      const line = apsidal();
      return {
        circles: [],
        ellipses: [
          {
            centre: about(-a * e, 0),
            majorAxis: satellitePlaneToPrimary(a, 0, orbit),
            minorAxis: satellitePlaneToPrimary(0, semiMinor, orbit),
            role: 'orbit',
          },
        ],
        arms: [
          { from: line.from, to: line.to, role: 'apsidal' },
          { from: primary, to: body, role: 'radius' },
        ],
        markers: [
          { at: primary, role: 'focus' },
          { at: about(-2 * a * e, 0), role: 'focus' },
        ],
      };
    }

    /*
     * Newton: the same conic, but arrived at rather than fitted.
     *
     * A body under an inverse-square attraction to a fixed centre moves on a
     * conic with that centre at a focus — Principia I, XI — so the ellipse here
     * is a *result*, and the app's satellites are literally that two-body
     * solution rather than anything integrated. The figure is deliberately bare:
     * the attracting focus and the radius the force acts along, and none of the
     * descriptive scaffolding the earlier models need, because there is nothing
     * left to describe once the force is given.
     */
    case 'newton': {
      const semiMinor = a * Math.sqrt(1 - e * e);
      return {
        circles: [],
        ellipses: [
          {
            centre: about(-a * e, 0),
            majorAxis: satellitePlaneToPrimary(a, 0, orbit),
            minorAxis: satellitePlaneToPrimary(0, semiMinor, orbit),
            role: 'orbit',
          },
        ],
        arms: [{ from: primary, to: body, role: 'radius' }],
        markers: [{ at: primary, role: 'focus' }],
      };
    }
  }
}
