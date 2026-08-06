/**
 * Choosing the scale bar's length and what to call it.
 *
 * A scale bar is only meaningful where a fixed number of pixels means a fixed
 * distance everywhere on the map. That is true of the **true scale** projection,
 * which is a uniform scaling, and false of the compressed one, which is
 * logarithmic — there a bar would read differently next to Mercury than next to
 * Saturn, so no bar is drawn at all. See 13.3d in CLAUDE.md.
 *
 * The bar is sized the way a chart's is: pick a comfortable width, ask what
 * distance that covers, then round *down* to something a reader can hold in
 * their head, and shorten the bar to match. A bar labelled "1 000 000 km" says
 * something; the same bar labelled "1 174 382 km" says nothing.
 */

export const KM_PER_AU = 149_597_870.7;

/**
 * Below this, the bar reads in kilometres instead of AU.
 *
 * The astronomical unit is the map's native measure and the one the app teaches
 * in, so it wins wherever it stays legible. But once a deep zoom at true scale
 * brings the lunar orbit into view, the honest AU readings are 0.002 and 0.005 —
 * numbers that convey nothing. At that range kilometres are what carry the
 * sense of distance the bar exists to give.
 */
const AU_FLOOR = 0.1;

/** The 1-2-5 sequence every chart axis and map scale is built from. */
const NICE_STEPS = [1, 2, 5];

export type ScaleUnit = 'au' | 'km';

export interface ScaleBar {
  /** How long to draw the bar, in pixels. Always at most the target. */
  lengthPx: number;
  /** The distance it spans, already rounded to something readable. */
  value: number;
  unit: ScaleUnit;
  /** Decimals the value needs, so 0.5 AU does not print as "1 AU". */
  fractionDigits: number;
}

/** The largest 1/2/5 × 10ⁿ that does not exceed `raw`. */
function niceBelow(raw: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  let best = magnitude;
  for (const step of NICE_STEPS) {
    const candidate = step * magnitude;
    if (candidate <= raw) best = candidate;
  }
  return best;
}

/**
 * Size the bar for a projection of `pxPerAu`, aiming for `targetPx` and never
 * exceeding it.
 *
 * Returns null when there is nothing sensible to draw — a collapsed viewport,
 * or a scale that has gone non-finite. The caller hides the bar rather than
 * printing a NaN.
 */
export function chooseScaleBar(pxPerAu: number, targetPx: number): ScaleBar | null {
  if (!Number.isFinite(pxPerAu) || pxPerAu <= 0) return null;
  if (!Number.isFinite(targetPx) || targetPx <= 0) return null;

  const targetAu = targetPx / pxPerAu;
  if (!Number.isFinite(targetAu) || targetAu <= 0) return null;

  const unit: ScaleUnit = targetAu >= AU_FLOOR ? 'au' : 'km';
  const perUnitAu = unit === 'au' ? 1 : 1 / KM_PER_AU;
  const value = niceBelow(targetAu / perUnitAu);
  if (!Number.isFinite(value) || value <= 0) return null;

  return {
    lengthPx: value * perUnitAu * pxPerAu,
    value,
    unit,
    // 0.1 and 0.5 need a decimal; 1, 2, 500000 do not.
    fractionDigits: Math.max(0, -Math.floor(Math.log10(value))),
  };
}
