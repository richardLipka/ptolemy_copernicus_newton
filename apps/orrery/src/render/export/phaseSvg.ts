/**
 * The phase card, redrawn as real SVG shapes — see `mapSvg.ts`'s file note for
 * why this app's exports never snapshot the DOM.
 *
 * The disc is built the same way `.phase-disc` is in shell.css: the body's
 * whole circle starts in shadow, the lit hemisphere is laid over one half of
 * it, and a terminator ellipse — tinted if the extra light bulges past that
 * half, shadowed if it cuts into it — is what turns a half-moon into any
 * other phase. Three shapes, clipped to the disc, in that order.
 */

import type { BodyId } from '@orrery/core/bodies';
import { bodyName, formatNumber, t } from '../../i18n/i18n';
import { buildView } from '../../state/selectors';
import { phaseName } from '@orrery/core/illumination';
import type { State } from '../../state/store';
import { escapeXml, resolveThemeColor, svgDocument } from './svgDocument';

const num = (value: number, digits = 2): string => value.toFixed(digits);

function textTag(
  x: number,
  y: number,
  content: string,
  fill: string,
  size: number,
  anchor: 'start' | 'middle' | 'end' = 'middle',
  extra = '',
): string {
  return `<text x="${num(x)}" y="${num(y)}" text-anchor="${anchor}" fill="${fill}" font-size="${size}"${extra}>${escapeXml(content)}</text>`;
}

export interface PhaseSvgOptions {
  width: number;
  height: number;
  state: State;
}

/** The card for the selected body's phase, or null where there is none to draw. */
export function buildPhaseSvg({ width, height, state }: PhaseSvgOptions): string | null {
  const selected = state.selectedBody;
  if (!selected || selected === 'sun') return null;

  const view = buildView(state);
  const body = view.bodies.find((candidate) => candidate.id === selected);
  if (!body || body.isObserver) return null;

  const surface = resolveThemeColor('--surface');
  const textStrong = resolveThemeColor('--text-strong');
  const text = resolveThemeColor('--text');
  const shadow = resolveThemeColor('--shadow-fill');
  const tint = resolveThemeColor(`--body-${selected as BodyId}`);

  const lit = body.illumination.illuminatedFraction;
  const litWidthFraction = Math.abs(2 * lit - 1);
  const gibbous = lit >= 0.5;
  const waxing = body.illumination.waxing;

  const centreX = width / 2;
  const discY = height * 0.4;
  const radius = Math.min(width, height) * 0.24;

  const clipId = 'phase-disc-clip';
  const parts: string[] = [];

  parts.push(
    `<clipPath id="${clipId}"><circle cx="${num(centreX)}" cy="${num(discY)}" r="${num(radius)}"/></clipPath>`,
  );
  parts.push(`<g clip-path="url(#${clipId})">`);
  // The whole disc starts in shadow.
  parts.push(`<circle cx="${num(centreX)}" cy="${num(discY)}" r="${num(radius)}" fill="${shadow}"/>`);
  // The lit hemisphere, right if waxing, left if waning — the same reason a
  // waxing Moon is lit on the right.
  const halfX = waxing ? centreX : centreX - radius;
  parts.push(`<rect x="${num(halfX)}" y="${num(discY - radius)}" width="${num(radius)}" height="${num(radius * 2)}" fill="${tint}"/>`);
  // The terminator: an ellipse the width the phase actually is, adding light
  // if more than half is lit, cutting into it if less.
  parts.push(
    `<ellipse cx="${num(centreX)}" cy="${num(discY)}" rx="${num(litWidthFraction * radius)}" ry="${num(radius)}" fill="${gibbous ? tint : shadow}"/>`,
  );
  parts.push('</g>');

  const headingY = discY - radius - 20;
  parts.push(textTag(centreX, headingY, bodyName(selected), textStrong, 18));

  const captionY = discY + radius + 22;
  const caption = t('info.asSeenFrom', { body: bodyName(state.observationPoint, 'genitive') });
  parts.push(textTag(centreX, captionY, caption, text, 12, 'middle', ' font-style="italic"'));

  const rows: [string, string][] = [
    [t('info.phase'), t(`phase.${phaseName(body.illumination)}`)],
    [t('info.illuminated'), `${formatNumber(lit * 100, 0)} %`],
    [t('info.phaseAngle'), `${formatNumber(body.illumination.phaseAngle, 1)}${t('info.unit.deg')}`],
  ];

  let rowY = captionY + 28;
  const rowGap = 22;
  const columnGap = width * 0.12;
  for (const [label, value] of rows) {
    parts.push(textTag(centreX - columnGap, rowY, label, text, 12, 'end'));
    parts.push(textTag(centreX + columnGap, rowY, value, textStrong, 12, 'start'));
    rowY += rowGap;
  }

  return svgDocument(width, height, surface, parts.join(''));
}
