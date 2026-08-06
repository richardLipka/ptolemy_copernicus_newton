/**
 * Star figures for the celestial ring.
 *
 * DECORATIVE ONLY. These coordinates are approximate and exist to make
 * "apparent position against the stars" legible on the band; they are not a
 * star catalogue and nothing in the app computes against them. The real data
 * are the computed body positions and the constellation boundaries in
 * `core/zodiac.ts` — if you need a star's position for anything that matters,
 * do not take it from here.
 *
 * Each star is an approximate J2000 ecliptic longitude and latitude in degrees
 * with a rough magnitude for dot size. `lines` join stars by index to give the
 * traditional stick figure of an engraved chart.
 */

export interface FigureStar {
  lon: number;
  lat: number;
  mag: number;
}

export interface Constellation {
  id: string;
  stars: readonly FigureStar[];
  lines: readonly (readonly [number, number])[];
}

export const CONSTELLATION_FIGURES: readonly Constellation[] = [
  {
    id: 'aries',
    stars: [
      { lon: 37.9, lat: 9.9, mag: 2.0 },
      { lon: 33.5, lat: 8.5, mag: 2.6 },
      { lon: 33.2, lat: 7.1, mag: 3.9 },
    ],
    lines: [
      [0, 1],
      [1, 2],
    ],
  },
  {
    id: 'taurus',
    stars: [
      { lon: 59.7, lat: 4.0, mag: 2.9 },
      { lon: 69.8, lat: -5.5, mag: 0.9 },
      { lon: 82.6, lat: 5.4, mag: 1.7 },
      { lon: 85.4, lat: -2.2, mag: 3.0 },
      { lon: 66.5, lat: -5.8, mag: 3.5 },
    ],
    lines: [
      [0, 4],
      [4, 1],
      [1, 2],
      [1, 3],
    ],
  },
  {
    id: 'gemini',
    stars: [
      { lon: 110.2, lat: 10.1, mag: 1.6 },
      { lon: 113.2, lat: 6.7, mag: 1.1 },
      { lon: 99.4, lat: -6.9, mag: 1.9 },
      { lon: 98.5, lat: 0.2, mag: 3.0 },
      { lon: 95.7, lat: -0.9, mag: 2.9 },
    ],
    lines: [
      [0, 1],
      [0, 3],
      [3, 2],
      [1, 4],
      [4, 2],
    ],
  },
  {
    id: 'cancer',
    stars: [
      { lon: 134.6, lat: -5.1, mag: 4.3 },
      { lon: 128.6, lat: 0.1, mag: 3.9 },
      { lon: 127.9, lat: 3.1, mag: 4.7 },
      { lon: 124.1, lat: -5.6, mag: 3.5 },
    ],
    lines: [
      [3, 1],
      [1, 2],
      [1, 0],
    ],
  },
  {
    id: 'leo',
    stars: [
      { lon: 149.8, lat: 0.5, mag: 1.4 },
      { lon: 152.6, lat: 8.5, mag: 2.0 },
      { lon: 163.5, lat: 14.3, mag: 2.6 },
      { lon: 171.3, lat: 12.3, mag: 2.1 },
      { lon: 150.5, lat: 4.9, mag: 3.5 },
    ],
    lines: [
      [0, 4],
      [4, 1],
      [1, 2],
      [2, 3],
      [3, 0],
    ],
  },
  {
    id: 'virgo',
    stars: [
      { lon: 203.8, lat: -2.1, mag: 1.0 },
      { lon: 190.5, lat: 2.8, mag: 2.7 },
      { lon: 177.3, lat: 0.7, mag: 3.6 },
      { lon: 190.0, lat: 16.2, mag: 2.8 },
      { lon: 200.5, lat: 8.5, mag: 3.4 },
    ],
    lines: [
      [2, 1],
      [1, 0],
      [1, 3],
      [3, 4],
      [4, 0],
    ],
  },
  {
    id: 'libra',
    stars: [
      { lon: 225.1, lat: 0.3, mag: 2.7 },
      { lon: 229.3, lat: 8.5, mag: 2.6 },
      { lon: 232.5, lat: -1.9, mag: 3.3 },
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 0],
    ],
  },
  {
    id: 'scorpius',
    stars: [
      { lon: 242.6, lat: -1.8, mag: 2.3 },
      { lon: 241.9, lat: 1.0, mag: 2.6 },
      { lon: 249.8, lat: -4.6, mag: 1.1 },
    ],
    lines: [
      [1, 0],
      [0, 2],
    ],
  },
  {
    id: 'ophiuchus',
    stars: [
      { lon: 255.5, lat: 11.5, mag: 2.5 },
      { lon: 261.5, lat: 7.2, mag: 2.4 },
      { lon: 249.0, lat: 14.0, mag: 3.2 },
    ],
    lines: [
      [2, 0],
      [0, 1],
    ],
  },
  {
    id: 'sagittarius',
    stars: [
      { lon: 276.4, lat: -11.0, mag: 1.8 },
      { lon: 274.0, lat: -6.9, mag: 2.7 },
      { lon: 282.0, lat: -3.4, mag: 2.1 },
      { lon: 285.7, lat: -7.2, mag: 2.6 },
      { lon: 274.5, lat: -2.2, mag: 2.8 },
    ],
    lines: [
      [0, 1],
      [1, 4],
      [4, 2],
      [2, 3],
      [3, 0],
    ],
  },
  {
    id: 'capricornus',
    stars: [
      { lon: 303.9, lat: 6.9, mag: 3.6 },
      { lon: 304.5, lat: 4.9, mag: 3.1 },
      { lon: 323.6, lat: -2.6, mag: 2.9 },
      { lon: 322.0, lat: -2.5, mag: 3.7 },
    ],
    lines: [
      [0, 1],
      [1, 3],
      [3, 2],
    ],
  },
  {
    id: 'aquarius',
    stars: [
      { lon: 333.0, lat: 10.0, mag: 2.9 },
      { lon: 338.5, lat: 8.0, mag: 3.8 },
      { lon: 346.0, lat: -8.0, mag: 3.3 },
      { lon: 329.0, lat: 8.6, mag: 2.9 },
    ],
    lines: [
      [3, 0],
      [0, 1],
      [1, 2],
    ],
  },
  {
    id: 'pisces',
    stars: [
      { lon: 29.4, lat: -9.1, mag: 3.8 },
      { lon: 22.5, lat: 5.4, mag: 3.6 },
      { lon: 8.5, lat: 7.2, mag: 3.7 },
      { lon: 356.0, lat: 4.0, mag: 4.3 },
    ],
    lines: [
      [0, 1],
      [1, 2],
      [2, 3],
    ],
  },
];
