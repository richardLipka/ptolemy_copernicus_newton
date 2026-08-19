/**
 * The star catalogue, against the sky.
 *
 * These are the only fixed points in the app: everything else is computed from
 * a model, and a star is a datum. If one of them is in the wrong place the band
 * of sky becomes a picture of nothing, and it would look entirely convincing
 * while being wrong — which is exactly the failure the app's decorative
 * constellation figures carry a warning about.
 *
 * So each conversion is checked against a published ecliptic position, and the
 * catalogue itself against what it claims to be.
 */

import { describe, expect, it } from 'vitest';

import {
  BRIGHT_STARS,
  OBLIQUITY_J2000,
  equatorialToEcliptic,
  starPositions,
  starsWithin,
} from './stars.js';

describe('the conversion lands on published positions', () => {
  /*
   * Ecliptic coordinates as tabulated for J2000. Any star atlas gives these;
   * the point of checking eight of them spread right round the zodiac is that a
   * sign error or a wrong obliquity cannot pass all eight.
   */
  const PUBLISHED: Record<string, [number, number]> = {
    Aldebaran: [69.79, -5.47],
    Pollux: [113.22, 6.68],
    Regulus: [149.83, 0.47],
    Spica: [203.84, -2.06],
    Arcturus: [204.23, 30.74],
    Antares: [249.76, -4.57],
    Altair: [301.78, 29.3],
    Hamal: [37.66, 9.97],
  };

  for (const [name, [longitude, latitude]] of Object.entries(PUBLISHED)) {
    it(`puts ${name} where the atlas puts it`, () => {
      const star = BRIGHT_STARS.find((candidate) => candidate.name === name);
      expect(star, `${name} is in the catalogue`).toBeDefined();

      const ecliptic = equatorialToEcliptic(star!.ra, star!.dec);
      expect(ecliptic.longitude).toBeCloseTo(longitude, 1);
      expect(ecliptic.latitude).toBeCloseTo(latitude, 1);
    });
  }

  it('uses the J2000 obliquity, which is what makes those agree', () => {
    expect(OBLIQUITY_J2000).toBeCloseTo(23.4392911, 6);

    // A point on the equator at the equinox is on the ecliptic; a quarter turn
    // later the two frames differ by exactly the obliquity.
    expect(equatorialToEcliptic(0, 0).latitude).toBeCloseTo(0, 9);
    expect(equatorialToEcliptic(90, OBLIQUITY_J2000).latitude).toBeCloseTo(0, 6);
    expect(equatorialToEcliptic(90, 0).latitude).toBeCloseTo(-OBLIQUITY_J2000, 6);
  });
});

describe('the catalogue is what it says it is', () => {
  it('keeps to the band the planets keep to', () => {
    for (const star of starPositions()) {
      expect(Math.abs(star.latitude), star.name).toBeLessThan(35);
    }
  });

  it('is bright stars, and no faint ones', () => {
    for (const star of BRIGHT_STARS) {
      expect(star.magnitude, star.name).toBeLessThan(3.2);
    }
    // The first-magnitude landmarks an observer actually navigates by.
    const brightest = BRIGHT_STARS.filter((star) => star.magnitude < 1.5).map((s) => s.name);
    expect(brightest).toEqual(
      expect.arrayContaining(['Aldebaran', 'Regulus', 'Spica', 'Antares', 'Pollux', 'Arcturus']),
    );
  });

  it('names each star once, and runs round the zodiac in order', () => {
    const names = BRIGHT_STARS.map((star) => star.name);
    expect(new Set(names).size).toBe(names.length);

    const longitudes = starPositions().map((star) => star.longitude);
    expect([...longitudes].sort((a, b) => a - b)).toEqual(longitudes);
  });

  it('spreads round the whole circle rather than clustering', () => {
    // Every quadrant of the ecliptic has landmarks in it, or a band opened in
    // one of them would have nothing to measure against.
    for (const quadrant of [0, 90, 180, 270]) {
      const inQuadrant = starPositions().filter(
        (star) => star.longitude >= quadrant && star.longitude < quadrant + 90,
      );
      expect(inQuadrant.length, `${quadrant}-${quadrant + 90}`).toBeGreaterThan(2);
    }
  });
});

describe('a window on the catalogue', () => {
  it('finds what is inside it and nothing outside', () => {
    const found = starsWithin(69.79, 5);
    expect(found.map((star) => star.name)).toContain('Aldebaran');

    for (const star of found) expect(Math.abs(star.offset)).toBeLessThanOrEqual(5);
  });

  it('wraps across the equinox, where a naive subtraction would not', () => {
    // Markab sits at 353.5 degrees. A window centred at 5 degrees must find it
    // eleven degrees to the west, not three hundred and forty-eight to the east.
    const found = starsWithin(5, 15);
    const markab = found.find((star) => star.name === 'Markab');

    expect(markab).toBeDefined();
    expect(markab!.offset).toBeCloseTo(-11.5, 0);
  });

  it('gives the same answer every time, since nothing about a star moves here', () => {
    expect(starPositions()).toBe(starPositions());
  });
});
