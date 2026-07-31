/**
 * Measure what truncating VSOP87 actually costs, at several thresholds.
 *
 * Development scaffolding for choosing the threshold in
 * `generate-vsop87.mjs` — not part of the app.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const BODIES = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn'];
const DAYS_PER_MILLENNIUM = 365250;
const J2000 = 2451545.0;
const ARCSEC = (180 / Math.PI) * 3600;

const full = Object.fromEntries(
  BODIES.map((b) => {
    const m = require(`astronomia/data/vsop87B${b}`);
    return [b, m.default ?? m];
  }),
);

const toArray = (series, threshold) => {
  const out = [];
  for (let p = 0; ; p++) {
    const terms = series[String(p)];
    if (!terms) break;
    out.push(terms.filter(([a]) => Math.abs(a) >= threshold));
  }
  while (out.length && out[out.length - 1].length === 0) out.pop();
  return out;
};

const evaluate = (series, t) => {
  let total = 0;
  for (let p = series.length - 1; p >= 0; p--) {
    let sum = 0;
    for (const [a, b, c] of series[p]) sum += a * Math.cos(b + c * t);
    total = total * t + sum;
  }
  return total;
};

// Sample the app's whole supported range, 1600–2400.
const samples = [];
for (let year = 1600; year <= 2400; year += 7) {
  samples.push(J2000 + (year - 2000) * 365.25);
}

console.log('threshold   terms   worst longitude error   worst radius error');
for (const threshold of [1e-6, 3e-7, 1e-7, 3e-8, 1e-8]) {
  let terms = 0;
  let worstAngle = 0;
  let worstRadius = 0;

  for (const body of BODIES) {
    const cut = {
      L: toArray(full[body].L, threshold),
      B: toArray(full[body].B, threshold),
      R: toArray(full[body].R, threshold),
    };
    const whole = {
      L: toArray(full[body].L, 0),
      B: toArray(full[body].B, 0),
      R: toArray(full[body].R, 0),
    };
    terms += [cut.L, cut.B, cut.R].flat().reduce((s, x) => s + x.length, 0);

    for (const jd of samples) {
      const t = (jd - J2000) / DAYS_PER_MILLENNIUM;
      worstAngle = Math.max(
        worstAngle,
        Math.abs(evaluate(cut.L, t) - evaluate(whole.L, t)) * ARCSEC,
        Math.abs(evaluate(cut.B, t) - evaluate(whole.B, t)) * ARCSEC,
      );
      worstRadius = Math.max(
        worstRadius,
        Math.abs(evaluate(cut.R, t) - evaluate(whole.R, t)),
      );
    }
  }

  console.log(
    `${threshold.toExponential(0).padStart(8)}  ${String(terms).padStart(6)}   ` +
      `${worstAngle.toFixed(2).padStart(8)}"          ${(worstRadius * 1.496e8).toFixed(0).padStart(8)} km`,
  );
}
