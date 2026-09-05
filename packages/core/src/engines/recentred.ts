/**
 * The harness a heliocentric model wears once something other than the Sun is
 * held still.
 *
 * Neither Copernicus nor Kepler disagreed with Ptolemy about where a planet
 * appears; they disagreed about which body to hold still. `frame.ts` already
 * makes that a subtraction. This makes the same subtraction *visible*, by
 * splitting it back into the two motions it is composed of:
 *
 *     body − origin  =  (origin → Sun)  +  (Sun → body)
 *
 * Both terms are curves the model already draws. Insert the Sun between them
 * and a heliocentric model, recentred, becomes a deferent carrying an epicycle
 * — which is what Ptolemy drew. That is the whole content of the overlay: not a
 * claim that Ptolemy was right, but that the disagreement was never about the
 * geometry.
 *
 * **This changes nothing about where a body goes.** Positions still come from
 * the engine. The overlay is drawn from the same elements the engine uses and
 * ends, by construction, exactly on the body the engine placed — and the test
 * beside this file pins that down, because a harness that missed its own body
 * would be a picture of an argument rather than the argument.
 *
 * Two orders are available and they are the *same two vectors added the other
 * way round*, so the endpoint is identical and only the joint between them
 * moves. Which order is used is decided by one rule — **the larger orbit is the
 * deferent** — and that rule reproduces, with no special-casing, the split the
 * *Almagest* already makes:
 *
 *   - Origin outside the body (Earth and Venus): the origin's own orbit is the
 *     deferent, so the joint is the **Sun itself**, and the figure is Tycho's.
 *     Ptolemy's inferior planets are laid out exactly so, with the Sun carrying
 *     the epicycle.
 *   - Body outside the origin (Earth and Mars): the body's orbit is the
 *     deferent, drawn about the fixed origin, and the epicycle it carries is
 *     the origin's own orbit reversed. That is Ptolemy's superior planet, whose
 *     epicycle arm stays parallel to the direction of the Sun — because it *is*
 *     the Earth's orbit.
 *
 * In the second case the joint is not the Sun and nothing physical sits there.
 * `jointIsSun` says which case is on screen so a caption can avoid claiming
 * otherwise.
 */

import { BODIES, type BodyId, type KeplerianElements, type OrbitalModel } from '../bodies.js';
import type { Construction, ConstructionEllipse } from '../construction.js';
import { add, scale, sub, vec3, type Vec3 } from '../vec.js';
import {
  COPERNICAN_PARAMETERS,
  copernicanHeliocentricAt,
  copernicanPlaneGeometry,
  type CopernicanParameters,
} from './copernican.js';
import {
  elementsAt,
  meanAnomalyAt,
  orbitalPlaneToEcliptic,
  positionFromElements,
} from './keplerian.js';

/** Which model's curves the two stages are drawn with. */
export type RecentredFamily = 'copernican' | 'kepler';

export interface RecentredOptions {
  /** Orbits to use in place of the body table's, as the engines accept. */
  orbits?: Partial<Record<BodyId, OrbitalModel>>;
  /** Copernicus's division of the eccentricity; ignored by the Keplerian form. */
  copernican?: CopernicanParameters;
}

export interface RecentredHarness {
  /** Drawn and measured exactly like any engine's own construction. */
  construction: Construction;
  /** Whose orbit became the deferent — always the larger of the two. */
  deferentBody: BodyId;
  /** Whose orbit rides on it. */
  epicycleBody: BodyId;
  /**
   * True when the joint between the two stages is the Sun.
   *
   * It is the Sun exactly when the origin's own orbit is the deferent. In the
   * other order the joint is a construction point with nothing at it, which is
   * the same thing Ptolemy's epicycle centre is.
   */
  jointIsSun: boolean;
}

/**
 * One leg of the chain: a body's orbit, drawn from `anchor`, and where it ends.
 *
 * `reversed` traverses the orbit backwards through the origin — the vector from
 * a body to the Sun rather than from the Sun to the body. Negating the whole
 * figure keeps the drawn curve congruent to the orbit it came from, which is
 * the point: what carries the Earth is the Earth's own orbit, turned round.
 */
interface Stage {
  curves: { circles: Construction['circles']; ellipses: ConstructionEllipse[] };
  /** Geometric centre of the leading curve, for the marker and the apse line. */
  centre: Vec3;
  /** Half the apsidal axis, from that centre. */
  apsidalHalf: Vec3;
  end: Vec3;
}

const orbitOf = (id: BodyId, options: RecentredOptions): OrbitalModel | undefined =>
  options.orbits?.[id] ?? BODIES[id].orbit;

function keplerStage(
  anchor: Vec3,
  el: KeplerianElements,
  meanAnomaly: number,
  reversed: boolean,
  role: 'deferent' | 'epicycle',
): Stage {
  const semiMinor = el.a * Math.sqrt(1 - el.e * el.e);
  const sign = reversed ? -1 : 1;

  // The occupied focus sits on the anchor either way; only the direction the
  // figure is laid out in changes.
  const centre = add(anchor, scale(orbitalPlaneToEcliptic(-el.a * el.e, 0, el), sign));
  const majorAxis = scale(orbitalPlaneToEcliptic(el.a, 0, el), sign);
  const minorAxis = scale(orbitalPlaneToEcliptic(0, semiMinor, el), sign);
  const end = add(anchor, scale(positionFromElements(el, meanAnomaly), sign));

  return {
    curves: { circles: [], ellipses: [{ centre, majorAxis, minorAxis, role }] },
    centre,
    apsidalHalf: majorAxis,
    end,
  };
}

function copernicanStage(
  anchor: Vec3,
  el: KeplerianElements,
  meanAnomaly: number,
  reversed: boolean,
  role: 'deferent' | 'epicycle',
  params: CopernicanParameters,
): Stage {
  const g = copernicanPlaneGeometry(el, meanAnomaly, params);
  const sign = reversed ? -1 : 1;
  const place = (x: number, y: number): Vec3 =>
    add(anchor, scale(orbitalPlaneToEcliptic(x, y, el), sign));

  const centre = place(g.centreX, g.centreY);
  const epicycletCentre = place(g.epicycleX, g.epicycleY);

  return {
    curves: {
      circles: [
        { centre, radius: g.deferentRadius, role },
        // His epicyclet, whichever leg it belongs to. It is a fifth the size of
        // the epicycle Ptolemy needs and does a different job, so it never
        // takes the leading role even on the leading leg.
        { centre: epicycletCentre, radius: g.epicycletRadius, role: 'epicycle' },
      ],
      ellipses: [],
    },
    centre,
    // A free vector, as the rotation maps one: half the apsidal axis of the
    // deferent circle itself, not of the offset from the anchor.
    apsidalHalf: scale(orbitalPlaneToEcliptic(el.a, 0, el), sign),
    end: place(g.x, g.y),
  };
}

/**
 * Build the two-stage harness for `bodyId` about a stationary `originId`.
 *
 * Returns null wherever the picture would be a lie: with the Sun already
 * stationary there is nothing to decompose, a body cannot orbit itself, and a
 * moon has no heliocentric orbit of its own to contribute a leg.
 *
 * Everything is in the engine's own heliocentric coordinates, exactly as the
 * other constructions are, so the view recentres and projects it unchanged.
 */
export function recentredConstruction(
  jd: number,
  bodyId: BodyId,
  originId: BodyId,
  family: RecentredFamily,
  options: RecentredOptions = {},
): RecentredHarness | null {
  if (originId === 'sun' || bodyId === 'sun' || bodyId === originId) return null;

  const bodyOrbit = orbitOf(bodyId, options);
  const originOrbit = orbitOf(originId, options);
  if (!bodyOrbit || !originOrbit) return null;

  const params = options.copernican ?? COPERNICAN_PARAMETERS;
  const bodyEl = elementsAt(jd, bodyOrbit);
  const originEl = elementsAt(jd, originOrbit);
  const bodyM = meanAnomalyAt(jd, bodyOrbit);
  const originM = meanAnomalyAt(jd, originOrbit);

  // The larger orbit is the deferent, which is the only decision here and the
  // one that reproduces Ptolemy's own arrangement for both classes of planet.
  const originLeads = originEl.a > bodyEl.a;

  const stageAt = (
    anchor: Vec3,
    which: 'origin' | 'body',
    role: 'deferent' | 'epicycle',
  ): Stage =>
    family === 'kepler'
      ? keplerStage(
          anchor,
          which === 'origin' ? originEl : bodyEl,
          which === 'origin' ? originM : bodyM,
          which === 'origin',
          role,
        )
      : copernicanStage(
          anchor,
          which === 'origin' ? originEl : bodyEl,
          which === 'origin' ? originM : bodyM,
          which === 'origin',
          role,
          params,
        );

  /*
   * The chain starts where the stationary body's *own orbit* puts it, under the
   * same model the legs are drawn with — mixing families here left the
   * Copernican figure ending a thousand kilometres off its own planet.
   *
   * For the Earth that is the Earth–Moon barycentre rather than the Earth,
   * which the Keplerian engine separates and Copernicus has no concept of. The
   * two differ by some 4700 km, so under Kepler the figure begins that far from
   * the middle of the map. The alternative is to start on the marker and end
   * 4700 km off the body, and ending on the body is the claim being made.
   */
  const start =
    family === 'kepler'
      ? positionFromElements(originEl, originM)
      : copernicanHeliocentricAt(jd, originOrbit, params);
  const first = stageAt(start, originLeads ? 'origin' : 'body', 'deferent');
  const second = stageAt(first.end, originLeads ? 'body' : 'origin', 'epicycle');

  const construction: Construction = {
    circles: [...first.curves.circles, ...second.curves.circles],
    ellipses: [...first.curves.ellipses, ...second.curves.ellipses],
    arms: [
      // The deferent's own apse line, dashed like every other one.
      {
        from: add(first.centre, first.apsidalHalf),
        to: sub(first.centre, first.apsidalHalf),
        role: 'apsidal',
      },
      { from: first.centre, to: first.end, role: 'deferent-arm' },
      { from: first.end, to: second.end, role: 'epicycle-arm' },
    ],
    // No markers. The two centres and the joint are all readable from where the
    // arms meet, and a marker carries a hover note keyed by role and family
    // that this overlay has no wording for — a dot that explains itself as
    // something else would be worse than no dot.
    markers: [],
  };

  return {
    construction,
    deferentBody: originLeads ? originId : bodyId,
    epicycleBody: originLeads ? bodyId : originId,
    jointIsSun: originLeads,
  };
}

/**
 * Where the harness ends, which must be where the engine put the body.
 *
 * Exported for the test and for anything that wants to state the agreement in
 * figures rather than take it on trust.
 */
export function recentredEndpoint(
  jd: number,
  bodyId: BodyId,
  originId: BodyId,
  family: RecentredFamily,
  options: RecentredOptions = {},
): Vec3 | null {
  const harness = recentredConstruction(jd, bodyId, originId, family, options);
  if (!harness) return null;
  const arms = harness.construction.arms;
  return arms[arms.length - 1]?.to ?? vec3(0, 0, 0);
}
