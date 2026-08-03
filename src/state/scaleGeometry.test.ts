/**
 * What the two scales promise, and what they must not do.
 *
 * The compressed scale is allowed to lie about distance — that is its whole
 * purpose, and the Moon's exaggerated orbit is the most conspicuous lie in the
 * app. **True scale is the honest view**, and is the reason the toggle exists.
 * An honest view that still drew the Moon two hundred times too far from Earth
 * would be worth nothing at all, which is what these tests exist to prevent.
 */

import { describe, expect, it } from 'vitest';

import { AU_IN_KM } from '../core/bodies';
import { circularPositions } from '../core/engines/circular';
import { copernicanPositions } from '../core/engines/copernican';
import { keplerianPositions } from '../core/engines/keplerian';
import { nbodyEngine } from '../core/engines/nbody';
import { ptolemaicEpicyclicPositions } from '../core/engines/ptolemaic';
import { vsop87Positions } from '../core/engines/vsop87';
import { jdFromCalendar } from '../core/time';
import { angleDiffDeg, length, normalizeDeg, sub } from '../core/vec';
import { apparentLongitude } from '../core/coordinates';
import { projectPositions, projectRadius } from './selectors';

const JD = jdFromCalendar(2026, 3, 15);

type Positions = ReturnType<typeof keplerianPositions>;

/**
 * Every model that places a Moon, and the frame each is naturally drawn in.
 *
 * The Ptolemaic engine works geocentrically, so its map is centred on Earth; the
 * rest are heliocentric. The Moon must land beside Earth either way.
 */
const MODELS: [string, (jd: number) => Positions, 'sun' | 'earth'][] = [
  ['ptolemy', ptolemaicEpicyclicPositions, 'earth'],
  ['copernicus', copernicanPositions, 'sun'],
  ['concentric', circularPositions, 'sun'],
  ['kepler', keplerianPositions, 'sun'],
  ['newton', (jd) => nbodyEngine.positionsAt(jd) as Positions, 'sun'],
  ['reference', vsop87Positions, 'sun'],
];

const drawnSeparation = (
  positions: Positions,
  frame: 'sun' | 'earth',
  scaleMode: 'compressed' | 'true',
): number => {
  const projected = projectPositions(positions, frame, scaleMode);
  const earth = projected.get('earth')!;
  const moon = projected.get('moon')!;
  return Math.hypot(moon.x - earth.x, moon.y - earth.y);
};

describe('at true scale the Moon sits where it really is', () => {
  for (const [name, positionsAt, frame] of MODELS) {
    it(`${name} draws the Moon at its own true distance`, () => {
      const positions = positionsAt(JD);

      // The map is a plan view, so the drawn gap is the *in-plane* distance.
      // Comparing against the full 3D separation is wrong by the Moon's 5.1°
      // inclination — about a tenth of a percent, and enough to fail this.
      const offset = sub(positions.get('moon')!, positions.get('earth')!);
      const inPlaneAu = Math.hypot(offset.x, offset.y);

      const drawn = drawnSeparation(positions, frame, 'true');
      const honest = projectRadius(inPlaneAu, 'true');

      // The drawn gap is the projected true distance, not an exaggeration of it.
      expect(drawn, name).toBeCloseTo(honest, 9);
    });

    it(`${name} keeps the Moon hard against Earth at true scale`, () => {
      const drawn = drawnSeparation(positionsAt(JD), frame, 'true');

      // Under a thousandth of the map radius — a fraction of a pixel, which is
      // what 384 000 km against a 17.5 AU system honestly comes to.
      expect(drawn, name).toBeLessThan(0.001);
    });
  }

  it('is about a five-thousandth of an AU, in every model', () => {
    for (const [name, positionsAt] of MODELS) {
      const positions = positionsAt(JD);
      const km = length(sub(positions.get('moon')!, positions.get('earth')!)) * AU_IN_KM;

      // Perigee 356 000 km to apogee 407 000, with slack for the cruder models.
      expect(km, name).toBeGreaterThan(340_000);
      expect(km, name).toBeLessThan(420_000);
    }
  });
});

describe('the compressed scale still exaggerates it', () => {
  /**
   * Not a regression: without this the Moon is invisible at any magnification
   * that also shows Saturn, and the compressed scale exists precisely to show
   * everything at once.
   */
  it('draws the Moon far enough out to see', () => {
    for (const [name, positionsAt, frame] of MODELS) {
      const drawn = drawnSeparation(positionsAt(JD), frame, 'compressed');
      expect(drawn, name).toBeGreaterThan(0.01);
    }
  });

  it('exaggerates by something like two hundred times', () => {
    const positions = keplerianPositions(JD);
    const compressed = drawnSeparation(positions, 'sun', 'compressed');
    const trueScale = drawnSeparation(positions, 'sun', 'true');

    expect(compressed / trueScale).toBeGreaterThan(50);
  });

  /**
   * And it must still not overtake Mercury. Ptolemy's nested spheres bring
   * Mercury in to 0.058 AU, and an unchecked exaggeration used to draw the Moon
   * outside it — inverting the one ordering his cosmology is famous for.
   */
  it('never draws the Moon beyond Mercury', () => {
    for (const [name, positionsAt, frame] of MODELS) {
      for (let day = 0; day < 700; day += 7) {
        const projected = projectPositions(positionsAt(JD + day), frame, 'compressed');
        const earth = projected.get('earth')!;
        const moon = projected.get('moon')!;
        const mercury = projected.get('mercury');
        if (!mercury) continue;

        const toMoon = Math.hypot(moon.x - earth.x, moon.y - earth.y);
        const toMercury = Math.hypot(mercury.x - earth.x, mercury.y - earth.y);
        expect(toMoon, `${name} +${day}d`).toBeLessThan(toMercury);
      }
    }
  });
});

describe('why true scale makes an observer-centred sight-line straight', () => {
  /**
   * The invariant behind it, and the reason the renderer can draw the line in
   * two segments without introducing a bend.
   *
   * At true scale `projectVector` reduces to a *uniform scaling*: the radius is
   * `distance / SYSTEM_RADIUS_AU` and the direction is kept, so the whole map is
   * the real geometry multiplied by a constant. A uniform scaling preserves
   * directions, so the on-screen direction from observer to body is exactly the
   * body's apparent longitude — which is where the ring intercept is placed when
   * the sphere is centred on the observer. Same direction twice: no kink.
   *
   * Under the compressed scale the radius is a logarithm and this fails, which
   * is precisely the distortion the bend displays.
   */
  it('keeps the drawn direction equal to the apparent longitude', () => {
    for (const [name, positionsAt, frame] of MODELS) {
      const positions = positionsAt(JD);
      const projected = projectPositions(positions, frame, 'true');
      const earth = projected.get('earth')!;

      for (const id of ['mercury', 'venus', 'mars', 'jupiter', 'saturn'] as const) {
        const point = projected.get(id)!;
        const drawn = normalizeDeg(
          (Math.atan2(point.y - earth.y, point.x - earth.x) * 180) / Math.PI,
        );
        const apparent = normalizeDeg(apparentLongitude(positions, 'earth', id));

        expect(Math.abs(angleDiffDeg(drawn, apparent)), `${name}/${id}`).toBeLessThan(1e-9);
      }
    }
  });

  /** And that it genuinely does *not* hold at compressed scale. */
  it('does not hold at compressed scale, which is what the bend shows', () => {
    const positions = keplerianPositions(JD);
    const projected = projectPositions(positions, 'sun', 'compressed');
    const earth = projected.get('earth')!;

    let worst = 0;
    for (const id of ['mercury', 'venus', 'mars', 'jupiter', 'saturn'] as const) {
      const point = projected.get(id)!;
      const drawn = normalizeDeg(
        (Math.atan2(point.y - earth.y, point.x - earth.x) * 180) / Math.PI,
      );
      worst = Math.max(
        worst,
        Math.abs(angleDiffDeg(drawn, normalizeDeg(apparentLongitude(positions, 'earth', id)))),
      );
    }
    expect(worst).toBeGreaterThan(1);
  });
});
