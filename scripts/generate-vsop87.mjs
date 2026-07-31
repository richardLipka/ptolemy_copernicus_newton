/**
 * Generate a truncated VSOP87B table from the full published series.
 *
 * The full theory runs to tens of thousands of terms — Mars's longitude alone
 * has 1409 in its leading series — which is far more than a browser needs and
 * far more than a bundle should carry. This trims each series to the terms that
 * matter at the accuracy we want and writes a plain TypeScript module.
 *
 * Run at development time, never at runtime: the coefficients are checked in, so
 * the app keeps no dependency and works offline. `astronomia` is a devDependency
 * purely as the source of verified data — hand-transcribing VSOP87 would be a
 * transcription-error generator.
 *
 *   node scripts/generate-vsop87.mjs
 *
 * VSOP87**B** is the right variant here: heliocentric spherical referred to the
 * equinox of **J2000**, which is the frame this app already draws in. Variant D
 * is referred to the equinox of date and would need precession undone again.
 */

import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** Bodies VSOP87 covers that this app models. The Moon is not one of them. */
const BODIES = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn'];

/**
 * Amplitude below which a term is dropped, in the units of its own series
 * (radians for L and B, AU for R).
 *
 * Chosen by measuring rather than guessing — `sweep-vsop87.mjs` compares the
 * truncated series against the full one across 1600-2400:
 *
 *     threshold   terms   worst angle   worst radius
 *       1e-6       1297      2.11"         2740 km
 *       3e-7       2175      0.79"          989 km
 *       1e-7       3438      0.42"          379 km
 *       1e-8       8973      0.06"           33 km
 *
 * 3e-7 buys sub-arcsecond positions for a table of a couple of thousand terms.
 * Since an event's timing error is its angular error divided by how fast the
 * angle closes, 0.79" puts even a Jupiter-Saturn conjunction — the slowest thing
 * this app finds — inside about a minute. Going finer costs bundle for accuracy
 * nothing in the app can use.
 */
const THRESHOLD = { L: 3e-7, B: 3e-7, R: 3e-7 };

const round = (value, places) => Number(value.toFixed(places));

function truncate(series, threshold) {
  const out = [];
  for (let power = 0; ; power++) {
    const terms = series[String(power)];
    if (!terms) break;
    const kept = terms
      .filter(([amplitude]) => Math.abs(amplitude) >= threshold)
      // Coefficients are rounded to the precision the accuracy needs; carrying
      // eleven decimals of a term worth two milliarcseconds is dead weight.
      .map(([a, b, c]) => [round(a, 11), round(b, 8), round(c, 6)]);
    out.push(kept);
  }
  // Trailing empty powers contribute nothing.
  while (out.length > 0 && out[out.length - 1].length === 0) out.pop();
  return out;
}

const serialise = (powers) =>
  `[\n${powers
    .map((terms) => `    [${terms.map(([a, b, c]) => `[${a},${b},${c}]`).join(',')}]`)
    .join(',\n')}\n  ]`;

let totalTerms = 0;
const blocks = [];

for (const body of BODIES) {
  const module = require(`astronomia/data/vsop87B${body}`);
  const data = module.default ?? module;

  const L = truncate(data.L, THRESHOLD.L);
  const B = truncate(data.B, THRESHOLD.B);
  const R = truncate(data.R, THRESHOLD.R);

  const count = [L, B, R].flat().reduce((sum, terms) => sum + terms.length, 0);
  const full = ['L', 'B', 'R']
    .map((k) => Object.values(data[k]).reduce((sum, t) => sum + t.length, 0))
    .reduce((a, b) => a + b, 0);
  totalTerms += count;
  process.stdout.write(`${body.padEnd(8)} ${String(count).padStart(5)} of ${full} terms\n`);

  blocks.push(
    `  ${body}: {\n    L: ${serialise(L)},\n    B: ${serialise(B)},\n    R: ${serialise(R)},\n  },`,
  );
}

const header = `/**
 * VSOP87B, truncated. GENERATED FILE — do not edit by hand.
 *
 * Produced by \`scripts/generate-vsop87.mjs\` from the published series, keeping
 * terms of amplitude ${THRESHOLD.L} or greater. ${totalTerms} terms in total, from
 * tens of thousands.
 *
 * Heliocentric spherical coordinates referred to the mean ecliptic and equinox
 * of J2000: longitude and latitude in radians, radius in AU. Each series is an
 * array indexed by power of time, and each term is [amplitude, phase, frequency]
 * evaluated as amplitude * cos(phase + frequency * t), with t in Julian
 * millennia from J2000.
 *
 * Accuracy against the full theory is measured in \`vsop87.test.ts\`.
 */

export type Vsop87Term = readonly [amplitude: number, phase: number, frequency: number];
export type Vsop87Series = readonly (readonly Vsop87Term[])[];

export interface Vsop87Body {
  readonly L: Vsop87Series;
  readonly B: Vsop87Series;
  readonly R: Vsop87Series;
}

export const VSOP87: Record<string, Vsop87Body> = {
`;

writeFileSync(
  new URL('../src/core/engines/vsop87Data.ts', import.meta.url),
  `${header}${blocks.join('\n')}\n};\n`,
  'utf8',
);

process.stdout.write(`\ntotal ${totalTerms} terms written\n`);
