/**
 * Kepler as a selectable model.
 *
 * Two things are worth pinning down. The geometry — that the drawn ellipse is
 * genuinely the orbit, with the Sun at a focus and not at the centre, since a
 * harness that merely *looked* elliptical would teach the wrong lesson. And the
 * accuracy, because the app's central claim is that the ellipse rather than
 * heliocentrism is what bought the precision, and that claim is only worth
 * making if the numbers carry it.
 */

import { describe, expect, it } from 'vitest';

import type { BodyId } from '../bodies';
import { apparentLongitude } from '../coordinates';
import { MODES } from './types';
import { jdFromCalendar } from '../time';
import { angleDiffDeg, sub, length, type Vec3 } from '../vec';
import { circularPositions } from './circular';
import { keplerianConstruction, keplerianPositions } from './keplerian';
import { vsop87Positions } from './vsop87';

const PLANETS: readonly BodyId[] = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];

const distance = (a: Vec3, b: Vec3): number => length(sub(a, b));

/** Worst apparent-longitude error against the reference, degrees. */
function worstError(
  positionsAt: (jd: number) => ReturnType<typeof keplerianPositions>,
  body: BodyId,
): number {
  let worst = 0;
  for (let year = 1700; year <= 2300; year += 10) {
    const jd = jdFromCalendar(year, 6, 1);
    worst = Math.max(
      worst,
      Math.abs(
        angleDiffDeg(
          apparentLongitude(positionsAt(jd), 'earth', body),
          apparentLongitude(vsop87Positions(jd), 'earth', body),
        ),
      ),
    );
  }
  return worst;
}

describe('the mode is registered', () => {
  it('sits between Copernicus and Newton, where it belongs', () => {
    const order = Object.keys(MODES);
    expect(order.indexOf('kepler')).toBeGreaterThan(order.indexOf('copernicus'));
    expect(order.indexOf('kepler')).toBeLessThan(order.indexOf('newton'));
  });

  it('is heliocentric, observed from Earth', () => {
    expect(MODES.kepler.engines).toEqual(['keplerian']);
    expect(MODES.kepler.defaultFrameOrigin).toBe('sun');
    expect(MODES.kepler.defaultObservationPoint).toBe('earth');
  });
});

describe('the drawn ellipse is the actual orbit', () => {
  /**
   * The defining property: the distances from any point of an ellipse to its
   * two foci sum to the major axis. Checking the *body's own position* against
   * the *drawn* foci and axis proves the curve on screen is the one the engine
   * integrates, rather than a decorative oval near it.
   */
  it('puts the body on the curve, to machine precision', () => {
    for (const body of PLANETS) {
      for (const year of [1650, 2026, 2380]) {
        const jd = jdFromCalendar(year, 3, 15);
        const construction = keplerianConstruction(jd, body)!;
        const position = keplerianPositions(jd).get(body)!;

        const ellipse = construction.ellipses![0]!;
        const semiMajor = length(ellipse.majorAxis);
        const foci = construction.markers
          .filter((marker) => marker.role === 'focus')
          .map((marker) => marker.at);

        expect(foci).toHaveLength(2);
        const sum = distance(position, foci[0]!) + distance(position, foci[1]!);
        expect(sum, `${body} in ${year}`).toBeCloseTo(2 * semiMajor, 9);
      }
    }
  });

  /**
   * The first law's whole content. Mars is the case Kepler actually worked on
   * and its focal offset is 0.14 AU — a tenth of the orbit's own radius, and
   * plainly visible on the map.
   */
  it('puts the Sun at a focus rather than at the centre', () => {
    const jd = jdFromCalendar(2026, 3, 15);
    const construction = keplerianConstruction(jd, 'mars')!;
    const ellipse = construction.ellipses![0]!;
    const sun = construction.markers.find((m) => m.role === 'focus')!.at;

    // The Sun sits at the origin of the engine's heliocentric frame...
    expect(length(sun)).toBe(0);
    // ...and the centre of the ellipse does not.
    expect(distance(ellipse.centre, sun)).toBeGreaterThan(0.13);

    // Offset equals a·e, the definition of the focal distance.
    const semiMajor = length(ellipse.majorAxis);
    const semiMinor = length(ellipse.minorAxis);
    const focalDistance = Math.sqrt(semiMajor * semiMajor - semiMinor * semiMinor);
    expect(distance(ellipse.centre, sun)).toBeCloseTo(focalDistance, 9);
  });

  it('marks a second, empty focus as far beyond the centre as the Sun is short of it', () => {
    const jd = jdFromCalendar(2026, 3, 15);
    const construction = keplerianConstruction(jd, 'mercury')!;
    const centre = construction.ellipses![0]!.centre;
    const [sun, empty] = construction.markers
      .filter((m) => m.role === 'focus')
      .map((m) => m.at);

    expect(distance(centre, empty!)).toBeCloseTo(distance(centre, sun!), 9);
    // Opposite sides, so the two foci are twice the focal distance apart.
    expect(distance(sun!, empty!)).toBeCloseTo(2 * distance(centre, sun!), 9);
  });

  it('is an ellipse rather than a circle, and flattest where eccentricity is largest', () => {
    const jd = jdFromCalendar(2026, 3, 15);
    const flattening = (body: BodyId): number => {
      const ellipse = keplerianConstruction(jd, body)!.ellipses![0]!;
      return length(ellipse.minorAxis) / length(ellipse.majorAxis);
    };
    // Mercury's e is 0.206, Venus's 0.007.
    expect(flattening('mercury')).toBeLessThan(0.99);
    expect(flattening('mercury')).toBeLessThan(flattening('venus'));
    expect(flattening('venus')).toBeGreaterThan(0.999);
  });

  it('draws nothing for the Sun, which everything else is drawn about', () => {
    expect(keplerianConstruction(jdFromCalendar(2026, 3, 15), 'sun')).toBeNull();
  });
});

describe("the Moon's osculating ellipse", () => {
  /**
   * The Moon is placed by a periodic series rather than by an ellipse, so its
   * harness is reconstructed from position and velocity: the two-body orbit
   * tangent to the true motion at that instant. Being tangent, it must still
   * pass exactly through the Moon.
   */
  it('passes through the Moon, like any other focus-sum ellipse', () => {
    for (const year of [1650, 2026, 2380]) {
      for (const day of [0, 97, 201]) {
        const jd = jdFromCalendar(year, 1, 1) + day;
        const construction = keplerianConstruction(jd, 'moon')!;
        const positions = keplerianPositions(jd);
        const moon = positions.get('moon')!;

        const semiMajor = length(construction.ellipses![0]!.majorAxis);
        const foci = construction.markers
          .filter((marker) => marker.role === 'focus')
          .map((marker) => marker.at);

        const sum = distance(moon, foci[0]!) + distance(moon, foci[1]!);
        expect(sum, `${year}+${day}`).toBeCloseTo(2 * semiMajor, 9);
      }
    }
  });

  it('is centred on Earth, not on the Sun', () => {
    const jd = jdFromCalendar(2026, 3, 15);
    const construction = keplerianConstruction(jd, 'moon')!;
    const earth = keplerianPositions(jd).get('earth')!;

    // The occupied focus is Earth itself, to the last bit.
    const occupied = construction.markers.find((m) => m.role === 'focus')!.at;
    expect(distance(occupied, earth)).toBeCloseTo(0, 12);
  });

  it('is about the size of the lunar orbit', () => {
    const jd = jdFromCalendar(2026, 3, 15);
    const semiMajor = length(keplerianConstruction(jd, 'moon')!.ellipses![0]!.majorAxis);
    // 384 400 km in AU, give or take the osculating wander.
    expect(semiMajor).toBeGreaterThan(0.0024);
    expect(semiMajor).toBeLessThan(0.0027);
  });

  /**
   * The reason this is worth drawing at all.
   *
   * A planet's osculating ellipse is very nearly fixed. The Moon's is not: the
   * Sun's pull on the Earth–Moon pair swings the eccentricity between about
   * 0.026 and 0.077 — a factor of three — within a few months. That wandering
   * is precisely what no fixed ellipse can capture, what Ptolemy chased with a
   * crank, and what Newton finally explained.
   */
  it('visibly breathes, where a planet’s barely moves', () => {
    const eccentricityOf = (jd: number, body: BodyId): number => {
      const ellipse = keplerianConstruction(jd, body)!.ellipses![0]!;
      const a = length(ellipse.majorAxis);
      const b = length(ellipse.minorAxis);
      return Math.sqrt(1 - (b * b) / (a * a));
    };

    const spread = (body: BodyId): number => {
      let low = Infinity;
      let high = -Infinity;
      for (let day = 0; day < 400; day += 4) {
        const e = eccentricityOf(jdFromCalendar(2026, 1, 1) + day, body);
        low = Math.min(low, e);
        high = Math.max(high, e);
      }
      return high - low;
    };

    // Measured: the Moon's eccentricity ranges over roughly 0.05, Mars's over
    // less than a millionth across the same span.
    expect(spread('moon')).toBeGreaterThan(0.03);
    expect(spread('mars')).toBeLessThan(1e-4);
    expect(spread('moon') / spread('mars')).toBeGreaterThan(100);
  });
});

describe('the ellipse is what bought the accuracy', () => {
  /**
   * Measured worst-case apparent longitude, 1700–2300:
   *
   *   body      Kepler   Copernicus
   *   mercury    0.013°       3.420°
   *   venus      0.025°       2.605°
   *   mars       0.062°      32.719°
   *   jupiter    0.221°       6.907°
   *   saturn     0.330°       6.919°
   *
   * Same heliocentric arrangement in both, so the entire difference is the
   * shape of the orbit. This is the app's sharpest single result.
   */
  it('beats Copernicus by at least a factor of ten on every planet', () => {
    for (const body of PLANETS) {
      const kepler = worstError(keplerianPositions, body);
      const copernicus = worstError(circularPositions, body);
      expect(copernicus / kepler, body).toBeGreaterThan(10);
    }
  });

  it('stays inside half a degree everywhere', () => {
    for (const body of PLANETS) {
      expect(worstError(keplerianPositions, body), body).toBeLessThan(0.5);
    }
  });

  /** Mars is the extreme case, and the orbit Kepler derived the law from. */
  it('is some five hundred times better than Copernicus at Mars', () => {
    expect(worstError(keplerianPositions, 'mars')).toBeLessThan(0.1);
    expect(worstError(circularPositions, 'mars')).toBeGreaterThan(20);
  });

  /**
   * But not perfect, and the residual is the point: two-body ellipses ignore
   * the planets' pull on each other, which is exactly what Newton went on to
   * explain. Jupiter and Saturn — the heaviest pair, locked in the great
   * inequality — carry the largest error for that reason.
   */
  it('leaves a residual largest where mutual perturbation is largest', () => {
    const outer = Math.max(
      worstError(keplerianPositions, 'jupiter'),
      worstError(keplerianPositions, 'saturn'),
    );
    const inner = Math.max(
      worstError(keplerianPositions, 'mercury'),
      worstError(keplerianPositions, 'venus'),
    );
    expect(outer).toBeGreaterThan(inner);
  });
});
