/**
 * The Moon must be drawn nearer than Mercury.
 *
 * It is the innermost body in every one of the models, and in Ptolemy's
 * nested spheres that ordering is not incidental — Moon, Mercury, Venus, Sun,
 * Mars, Jupiter, Saturn is the cosmology. Drawing the Moon outside Mercury
 * inverts the one arrangement the system is most remembered for.
 *
 * The risk is entirely of the map's own making. The Moon sits 0.0026 AU from
 * Earth and would be a third of a pixel away if drawn honestly, so its orbit is
 * exaggerated — and once the deferents were scaled to the nested spheres,
 * Mercury came in to 0.058 AU and the exaggeration overtook it on a fifth of all
 * days.
 */

import { describe, expect, it } from 'vitest';

import type { BodyId } from '@orrery/core/bodies';
import { circularPositions } from '@orrery/core/engines/circular';
import { keplerianPositions } from '@orrery/core/engines/keplerian';
import {
  almagestTablePositions,
  ptolemaicEpicyclicPositions,
} from '@orrery/core/engines/ptolemaic';
import type { PositionSet } from '@orrery/core/engines/types';
import { jdFromCalendar } from '@orrery/core/time';
import { projectPositions, type Point } from './selectors';

const START = jdFromCalendar(2026, 1, 1);
/** Long enough to cover Mercury's whole cycle several times over. */
const DAYS = 1200;

const gap = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** Worst case over the span: how much nearer Mercury is drawn than the Moon. */
function closestApproach(
  positionsAt: (jd: number) => PositionSet,
  frameOrigin: BodyId,
  scale: 'compressed' | 'true',
): number {
  let worst = Infinity;
  for (let d = 0; d < DAYS; d += 1) {
    const projected = projectPositions(positionsAt(START + d), frameOrigin, scale);
    const earth = projected.get('earth')!;
    const moon = projected.get('moon')!;
    const mercury = projected.get('mercury')!;
    worst = Math.min(worst, gap(mercury, earth) - gap(moon, earth));
  }
  return worst;
}

describe('the Moon is drawn inside Mercury', () => {
  const engines: [string, (jd: number) => PositionSet][] = [
    ['ptolemy epicyclic', ptolemaicEpicyclicPositions],
    ['ptolemy almagest tables', almagestTablePositions],
    ['copernicus', circularPositions],
    ['kepler', keplerianPositions],
  ];

  it('holds in every model, both frames and both scales', () => {
    for (const [label, positionsAt] of engines) {
      for (const frameOrigin of ['earth', 'sun'] as BodyId[]) {
        for (const scale of ['compressed', 'true'] as const) {
          expect(
            closestApproach(positionsAt, frameOrigin, scale),
            `${label} / ${frameOrigin} / ${scale}`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it('holds when the map is centred on another planet', () => {
    // The frame origin is free, so the ordering has to survive any choice.
    for (const frameOrigin of ['mars', 'jupiter', 'venus'] as BodyId[]) {
      expect(
        closestApproach(ptolemaicEpicyclicPositions, frameOrigin, 'compressed'),
        `centred on ${frameOrigin}`,
      ).toBeGreaterThan(0);
    }
  });

  it('still leaves the Moon far enough out to see', () => {
    // The exaggeration exists to make the Moon visible; capping it must not
    // collapse it onto Earth in the ordinary views. At a 450px instrument one
    // map-radius unit is 225px, so 0.015 is a little over three pixels.
    for (const [label, positionsAt] of [engines[0]!, engines[3]!]) {
      let smallest = Infinity;
      for (let d = 0; d < DAYS; d += 1) {
        const projected = projectPositions(positionsAt(START + d), 'earth', 'compressed');
        smallest = Math.min(
          smallest,
          gap(projected.get('moon')!, projected.get('earth')!),
        );
      }
      expect(smallest, label).toBeGreaterThan(0.015);
    }
  });
});
