/**
 * Distances the way Ptolemy stated them.
 *
 * The Almagest has no astronomical unit, no kilometre, and — for the planets —
 * no absolute distance of any kind. What it fixes is a *ratio*: each body's
 * epicycle, eccentricity and equant are given in parts of that body's own
 * deferent radius, which is always taken as 60. Directions seen from the Earth
 * are unchanged when a deferent, its eccentricity and its epicycle are scaled
 * together, so nothing in the Almagest's observations could ever have fixed the
 * scale, and Ptolemy did not pretend otherwise.
 *
 * Reporting his model in AU would therefore be an anachronism twice over: the
 * unit did not exist, and the quantity was not determined. Parts of the
 * deferent is what he actually wrote down.
 *
 * The consequence a reader has to be told about is that **each body's 60 is a
 * different real length**, so these figures cannot be compared between bodies.
 * That is not a limitation of this app; it is the state of the question until
 * the Planetary Hypotheses, where Ptolemy fixed the scale by a separate
 * cosmological argument — no gaps between the shells — and got a universe some
 * nineteen times too small.
 */

import type { BodyId } from '../bodies';
import { ptolemaicGeometryFor } from './ptolemaic';

/** Ptolemy's divisor. Every Almagest parameter is in sixtieths of a deferent. */
export const DEFERENT_PARTS = 60;

/**
 * Express `au` in parts of `id`'s deferent, or null where there is no deferent
 * to measure against — the Earth, which is the centre rather than a body on a
 * circle, and anything the engine does not model.
 *
 * No mean-motion source is taken, because a deferent's *radius* does not depend
 * on one: it comes from the nested spheres for a planet, and is fixed for the
 * Sun and Moon. Only the position on the circle moves with the tables, so the
 * Almagest and modern-motion sub-modes share one scale.
 */
export function inDeferentParts(au: number, jd: number, id: BodyId): number | null {
  const geometry = ptolemaicGeometryFor(jd, id);
  if (!geometry) return null;
  const { deferentRadius } = geometry;
  if (!Number.isFinite(deferentRadius) || deferentRadius <= 0) return null;
  if (!Number.isFinite(au)) return null;
  return (au / deferentRadius) * DEFERENT_PARTS;
}
