/**
 * The harness, in words: what a part of the machinery is, and what it is worth.
 *
 * The map can show that a small circle rides round a large one. It cannot say
 * that the small one is Mars's epicycle, that Ptolemy sized it at 39;30 of a
 * deferent of 60, or that this ratio is the planet's distance from a Sun his
 * model does not revolve around. That is what the note carries, and it is the
 * difference between watching a mechanism and reading one.
 *
 * Two rules hold the wording honest:
 *
 *  - **The same circle means different things in different models.** A circle
 *    marked `deferent` carries an epicycle round the Earth for Ptolemy and is
 *    Copernicus's eccentric about the Sun, so every note is chosen by the role
 *    *and* the family of machinery running — see `constructionFamilyOf`.
 *  - **A moon's harness is a counterfactual.** No model here derives the
 *    Galileans; what is drawn is how each *would* have described the orbit, and
 *    the notes for a satellite say so rather than putting words in anyone's
 *    mouth.
 */

import type { BodyId } from '@orrery/core/bodies';
import {
  measureHarnessPart,
  type HarnessMeasure,
  type HarnessPart,
  type HarnessRole,
  type HarnessTarget,
} from '../../state/harnessMeasures';
import type { State } from '../../state/store';
import {
  bodyName,
  formatExponent,
  formatNumber,
  formatShare,
  hasTranslation,
  t,
} from '../../i18n/i18n';

export interface HarnessNoteValue {
  label: string;
  value: string;
}

export interface HarnessNote {
  /** What the part is called. */
  title: string;
  /** Whose machinery it is. */
  subject: string;
  /** What it does, in a sentence or two. */
  body: string;
  values: HarnessNoteValue[];
}

/**
 * A length in Ptolemy's own notation: 39.5 parts is 39;30.
 *
 * The Almagest is written sexagesimally throughout and its parameters are
 * quoted that way in every edition, so a reader following along in Toomer sees
 * the same figures on screen. Only the fixed parameters of a construction get
 * it — a reading that changes with the date is not something Ptolemy wrote down
 * in this form.
 */
export function sexagesimal(parts: number): string {
  const sign = parts < 0 ? '-' : '';
  const size = Math.abs(parts);
  let whole = Math.floor(size);
  let sixtieths = Math.round((size - whole) * 60);
  if (sixtieths === 60) {
    whole += 1;
    sixtieths = 0;
  }
  return `${sign}${whole};${sixtieths}`;
}

/** Where a part's far and near ends are: an apogee, an aphelion, or neither. */
const apsisFlavour = (centreBody: BodyId): string =>
  centreBody === 'earth' ? 'earth' : centreBody === 'sun' ? 'sun' : 'primary';

function formatMeasure(measure: HarnessMeasure): string {
  const { value, unit } = measure;

  switch (unit) {
    case 'au':
      return `${formatNumber(value, 4)} ${t('info.unit.au')}`;
    case 'km':
      return `${formatNumber(value, 0)} ${t('info.unit.km')}`;
    case 'parts': {
      // One unit, two notations. See `info.ptolemyParts` for why this is the
      // only unit his constructions are quoted in at all.
      const decimal = `${formatNumber(value, 2)} ${t('info.unit.parts')}`;
      return measure.sexagesimal ? `${decimal} (${sexagesimal(value)})` : decimal;
    }
    case 'deg':
      return `${formatNumber(value, 1)}${t('info.unit.deg')}`;
    case 'degPerDay':
      return `${formatNumber(value, 3)}${t('harness.unit.degPerDay')}`;
    case 'days':
      return `${formatNumber(value, 2)} ${t('harness.unit.days')}`;
    case 'ratio':
      return formatNumber(value, 4);
    case 'kmPerSecond':
      return `${formatNumber(value, 2)} ${t('harness.unit.kmPerSecond')}`;
    case 'newton':
      return `${formatExponent(value)} ${t('harness.unit.newton')}`;
    case 'share':
      return formatShare(value);
  }
}

/**
 * Which label a figure carries.
 *
 * Apsides are named for what they are measured from — an apogee about the
 * Earth, an aphelion about the Sun, and neither of those about Jupiter.
 */
export function harnessValueKey(part: HarnessPart, measure: HarnessMeasure): string {
  if (measure.key === 'far' || measure.key === 'near') {
    return `harness.value.${measure.key}.${apsisFlavour(part.centreBody)}`;
  }
  return `harness.value.${measure.key}`;
}

/** What the part is called: the focus variants are named apart, the rest are not. */
export function harnessTitleKey(part: HarnessPart): string {
  return part.variant
    ? `harness.part.${part.role}.${part.variant}`
    : `harness.part.${part.role}`;
}

/**
 * The most specific wording that exists for this part.
 *
 * Specificity runs: this family's satellite counterfactual, this focus being
 * the occupied or the empty one, this family, and finally the role on its own.
 * Only the differences that change what is true get their own string, so most
 * roles resolve at the family and a few need nothing but themselves.
 */
export function harnessNoteKey(part: HarnessPart): string {
  const base = `harness.note.${part.role}`;
  const candidates = [
    part.satellite ? `${base}.${part.family}.satellite` : null,
    part.variant ? `${base}.${part.variant}` : null,
    `${base}.${part.family}`,
    base,
  ];

  for (const candidate of candidates) {
    if (candidate && hasTranslation(candidate)) return candidate;
  }
  return base;
}

/**
 * Every way a note might need to name a body.
 *
 * Two forms of each, because the two languages want different ones. English
 * prose takes the genitive throughout — it is the form that carries the article,
 * so "the Sun" rather than "Sun" — while Czech declines, and a sentence needs
 * whichever case its preposition governs. Each string picks what it needs.
 */
function names(part: HarnessPart): Record<string, string> {
  const filled: Record<string, string> = {
    body: bodyName(part.bodyId),
    bodyOf: bodyName(part.bodyId, 'genitive'),
    centre: bodyName(part.centreBody),
    centreOf: bodyName(part.centreBody, 'genitive'),
  };
  if (part.source) {
    filled.source = bodyName(part.source);
    filled.sourceOf = bodyName(part.source, 'genitive');
  }
  return filled;
}

export function describeHarnessPart(part: HarnessPart): HarnessNote {
  // A pull is named for the body exerting it rather than the body it acts on,
  // so the title's `body` is the source where there is one.
  const title =
    part.role === 'gravity' && part.source
      ? t('harness.part.gravity', {
          body: bodyName(part.source),
          bodyOf: bodyName(part.source, 'genitive'),
        })
      : t(harnessTitleKey(part));

  return {
    title,
    subject: bodyName(part.bodyId),
    body: t(harnessNoteKey(part), names(part)),
    values: part.measures.map((measure) => ({
      label: t(harnessValueKey(part, measure)),
      value: formatMeasure(measure),
    })),
  };
}

/** The note for one part of one body's machinery, or null where it has none. */
export function harnessNote(
  state: State,
  bodyId: BodyId,
  role: HarnessRole,
  target: HarnessTarget = {},
): HarnessNote | null {
  const part = measureHarnessPart(state, bodyId, role, target);
  return part ? describeHarnessPart(part) : null;
}
