/**
 * The bright stars a planet is actually seen against.
 *
 * `constellations.ts` in the app is decorative by its own declaration —
 * approximate positions, drawn to make the celestial ring look like an engraved
 * chart, and explicitly not to be computed against. This is the other thing: a
 * small catalogue of real stars, given as **catalogued J2000 right ascension and
 * declination** so any figure here can be checked against any star atlas, and
 * converted to the ecliptic frame the rest of the app works in.
 *
 * The selection is the brightest stars within about 35 degrees of the ecliptic —
 * the band the planets keep to, which is why these are the stars every
 * pre-telescopic observation was referred to. Ptolemy's own catalogue is
 * organised the same way and for the same reason. Sirius alone among the
 * first-magnitude stars is left out: at nearly forty degrees south of the
 * ecliptic no planet is ever seen near it.
 *
 * Two things are deliberately not modelled.
 *
 * **Proper motion.** Over the app's 1600-2400 range the fastest star here moves
 * by a few tenths of a degree — Arcturus most, at about a quarter of a degree a
 * century — which is below what a strip forty degrees wide can show and far
 * below the ten arcminutes a pre-telescopic instrument could measure.
 *
 * **Precession.** None is needed, and applying any would be a mistake: these
 * longitudes are in the fixed J2000 ecliptic, which is the frame every position
 * in the app is already in, so stars and planets are directly comparable as
 * they stand. Precession enters only when longitudes are named in tropical
 * signs, and `toTropicalLongitude` in `zodiac.ts` is what does that.
 */

import { normalizeDeg } from './vec.js';

/** Obliquity of the ecliptic at J2000, degrees. */
export const OBLIQUITY_J2000 = 23.4392911;

export interface Star {
  /** The proper name an observer would use. */
  name: string;
  /** Bayer designation, so the entry can be looked up in any catalogue. */
  designation: string;
  /** J2000 right ascension, degrees. */
  ra: number;
  /** J2000 declination, degrees. */
  dec: number;
  /** Visual magnitude. Lower is brighter; negative is very bright indeed. */
  magnitude: number;
}

export interface StarPosition extends Star {
  /** J2000 ecliptic longitude, degrees in [0, 360). */
  longitude: number;
  /** J2000 ecliptic latitude, degrees. */
  latitude: number;
}

const DEG = Math.PI / 180;

/**
 * Equatorial to ecliptic, at the J2000 obliquity.
 *
 * The standard rotation about the vernal equinox. Written out rather than
 * composed from matrices because it is two lines and this is the whole of it.
 */
export function equatorialToEcliptic(
  raDeg: number,
  decDeg: number,
): { longitude: number; latitude: number } {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const eps = OBLIQUITY_J2000 * DEG;

  const longitude = Math.atan2(
    Math.sin(ra) * Math.cos(eps) + Math.tan(dec) * Math.sin(eps),
    Math.cos(ra),
  );
  const latitude = Math.asin(
    Math.sin(dec) * Math.cos(eps) - Math.cos(dec) * Math.sin(eps) * Math.sin(ra),
  );

  return { longitude: normalizeDeg(longitude / DEG), latitude: latitude / DEG };
}

/**
 * The catalogue, in order of ecliptic longitude.
 *
 * Right ascension and declination are the catalogued quantities; the ecliptic
 * longitude and latitude noted against each are what the conversion above
 * returns, and are there so a reader can find a star in the list by eye.
 */
export const BRIGHT_STARS: readonly Star[] = [
  //   33.97   +8.49 in the J2000 ecliptic
  { name: 'Sheratan', designation: 'beta Arietis', ra: 28.6600, dec: 20.8081, magnitude: 2.64 },
  //   37.66   +9.97 in the J2000 ecliptic
  { name: 'Hamal', designation: 'alpha Arietis', ra: 31.7933, dec: 23.4625, magnitude: 2.0 },
  //   44.32  -12.59 in the J2000 ecliptic
  { name: 'Menkar', designation: 'alpha Ceti', ra: 45.5700, dec: 4.0897, magnitude: 2.53 },
  //   59.99   +4.05 in the J2000 ecliptic
  { name: 'Alcyone', designation: 'eta Tauri', ra: 56.8713, dec: 24.1050, magnitude: 2.87 },
  //   69.79   -5.47 in the J2000 ecliptic
  { name: 'Aldebaran', designation: 'alpha Tauri', ra: 68.9800, dec: 16.5092, magnitude: 0.86 },
  //   76.83  -31.12 in the J2000 ecliptic
  { name: 'Rigel', designation: 'beta Orionis', ra: 78.6346, dec: -8.2017, magnitude: 0.13 },
  //   80.95  -16.82 in the J2000 ecliptic
  { name: 'Bellatrix', designation: 'gamma Orionis', ra: 81.2829, dec: 6.3497, magnitude: 1.64 },
  //   82.57   +5.39 in the J2000 ecliptic
  { name: 'Elnath', designation: 'beta Tauri', ra: 81.5729, dec: 28.6075, magnitude: 1.65 },
  //   88.75  -16.03 in the J2000 ecliptic
  { name: 'Betelgeuse', designation: 'alpha Orionis', ra: 88.7929, dec: 7.4069, magnitude: 0.5 },
  //   99.10   -6.74 in the J2000 ecliptic
  { name: 'Alhena', designation: 'gamma Geminorum', ra: 99.4279, dec: 16.3992, magnitude: 1.92 },
  //  110.24  +10.10 in the J2000 ecliptic
  { name: 'Castor', designation: 'alpha Geminorum', ra: 113.6500, dec: 31.8883, magnitude: 1.58 },
  //  113.22   +6.68 in the J2000 ecliptic
  { name: 'Pollux', designation: 'beta Geminorum', ra: 116.3287, dec: 28.0261, magnitude: 1.14 },
  //  115.79  -16.02 in the J2000 ecliptic
  { name: 'Procyon', designation: 'alpha Canis Minoris', ra: 114.8254, dec: 5.2250, magnitude: 0.34 },
  //  149.62   +8.81 in the J2000 ecliptic
  { name: 'Algieba', designation: 'gamma Leonis', ra: 154.9933, dec: 19.8414, magnitude: 2.08 },
  //  149.83   +0.46 in the J2000 ecliptic
  { name: 'Regulus', designation: 'alpha Leonis', ra: 152.0929, dec: 11.9672, magnitude: 1.4 },
  //  171.62  +12.27 in the J2000 ecliptic
  { name: 'Denebola', designation: 'beta Leonis', ra: 177.2650, dec: 14.5719, magnitude: 2.14 },
  //  203.84   -2.05 in the J2000 ecliptic
  { name: 'Spica', designation: 'alpha Virginis', ra: 201.2983, dec: -11.1614, magnitude: 0.98 },
  //  204.23  +30.74 in the J2000 ecliptic
  { name: 'Arcturus', designation: 'alpha Bootis', ra: 213.9154, dec: 19.1825, magnitude: -0.05 },
  //  225.08   +0.33 in the J2000 ecliptic
  { name: 'Zubenelgenubi', designation: 'alpha Librae', ra: 222.7196, dec: -16.0417, magnitude: 2.75 },
  //  229.37   +8.50 in the J2000 ecliptic
  { name: 'Zubeneschamali', designation: 'beta Librae', ra: 229.2517, dec: -9.3828, magnitude: 2.61 },
  //  243.19   +1.01 in the J2000 ecliptic
  { name: 'Graffias', designation: 'beta Scorpii', ra: 241.3592, dec: -19.8056, magnitude: 2.62 },
  //  249.76   -4.57 in the J2000 ecliptic
  { name: 'Antares', designation: 'alpha Scorpii', ra: 247.3521, dec: -26.4319, magnitude: 1.06 },
  //  264.59  -13.79 in the J2000 ecliptic
  { name: 'Shaula', designation: 'lambda Scorpii', ra: 263.4021, dec: -37.1039, magnitude: 1.62 },
  //  275.08  -11.05 in the J2000 ecliptic
  { name: 'Kaus Australis', designation: 'epsilon Sagittarii', ra: 276.0429, dec: -34.3847, magnitude: 1.85 },
  //  282.39   -3.45 in the J2000 ecliptic
  { name: 'Nunki', designation: 'sigma Sagittarii', ra: 283.8163, dec: -26.2967, magnitude: 2.05 },
  //  301.78  +29.30 in the J2000 ecliptic
  { name: 'Altair', designation: 'alpha Aquilae', ra: 297.6958, dec: 8.8683, magnitude: 0.76 },
  //  304.05   +4.59 in the J2000 ecliptic
  { name: 'Dabih', designation: 'beta Capricorni', ra: 305.2529, dec: -14.7814, magnitude: 3.05 },
  //  323.39   +8.62 in the J2000 ecliptic
  { name: 'Sadalsuud', designation: 'beta Aquarii', ra: 322.8896, dec: -5.5711, magnitude: 2.9 },
  //  323.54   -2.60 in the J2000 ecliptic
  { name: 'Deneb Algedi', designation: 'delta Capricorni', ra: 326.7600, dec: -16.1272, magnitude: 2.85 },
  //  333.86  -21.14 in the J2000 ecliptic
  { name: 'Fomalhaut', designation: 'alpha Piscis Austrini', ra: 344.4125, dec: -29.6222, magnitude: 1.16 },
  //  353.49  +19.41 in the J2000 ecliptic
  { name: 'Markab', designation: 'alpha Pegasi', ra: 346.1904, dec: 15.2053, magnitude: 2.48 },
];

/**
 * The catalogue in ecliptic coordinates.
 *
 * Converted once. Nothing about it changes with the date — see the note on
 * precession above — so a consumer redrawing sixty times a second can ask for
 * it every frame.
 */
let converted: readonly StarPosition[] | null = null;

export function starPositions(): readonly StarPosition[] {
  if (!converted) {
    converted = BRIGHT_STARS.map((star) => ({
      ...star,
      ...equatorialToEcliptic(star.ra, star.dec),
    }));
  }
  return converted;
}

/**
 * The stars within `halfWidth` degrees of a longitude, nearest first in the
 * sense that matters: each carries its offset from the centre, signed east.
 */
export function starsWithin(
  centreLongitude: number,
  halfWidth: number,
): (StarPosition & { offset: number })[] {
  const found: (StarPosition & { offset: number })[] = [];

  for (const star of starPositions()) {
    // Signed difference, wrapped: a field centred at 5 degrees must find a star
    // at 355 degrees ten degrees to the west of it, not 350 to the east.
    const offset = normalizeDeg(star.longitude - centreLongitude + 180) - 180;
    if (Math.abs(offset) <= halfWidth) found.push({ ...star, offset });
  }

  return found;
}
