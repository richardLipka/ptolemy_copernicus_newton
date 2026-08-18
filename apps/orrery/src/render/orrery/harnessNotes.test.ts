/**
 * Every part a reader can point at has something to say, in both languages.
 *
 * The notes are chosen by role *and* by family, with fallbacks, so a missing
 * string does not throw or even look broken in development — `t` returns the key
 * itself, and `harness.note.orbit.newton` reads almost like a sentence at a
 * glance. This walks what the engines actually draw and insists on a real
 * wording for all of it, in Czech as well as English.
 */

import { describe, expect, it } from 'vitest';

import { BODY_IDS, type BodyId } from '@orrery/core/bodies';
import type { EngineId } from '@orrery/core/engines/types';
import { jdFromCalendar } from '@orrery/core/time';
import { rawConstruction } from '../../state/selectors';
import { measureHarnessPart, type HarnessRole } from '../../state/harnessMeasures';
import cs from '../../i18n/cs.json';
import en from '../../i18n/en.json';
import {
  describeHarnessPart,
  harnessNote,
  harnessNoteKey,
  harnessTitleKey,
  harnessValueKey,
  sexagesimal,
} from './harnessNotes';
import type { State } from '../../state/store';

/*
 * Both dictionaries, checked directly rather than through `t`.
 *
 * `t` falls back to English for a key Czech is missing, which is the right
 * behaviour on screen and useless here: a Czech reader would see an English
 * sentence and no test would notice. The keys are therefore looked up in each
 * dictionary as data.
 */
const DICTIONARIES: [string, Record<string, string>][] = [
  ['cs', cs],
  ['en', en],
];

/** Every name a note is allowed to substitute. See `names` in harnessNotes.ts. */
const PLACEHOLDERS = ['body', 'bodyOf', 'centre', 'centreOf', 'source', 'sourceOf'];

const JD = jdFromCalendar(2026, 3, 15);

const STATE: State = {
  mode: 'ptolemy',
  engineId: 'ptolemaic-epicyclic',
  ghostEngineId: null,
  frameOrigin: 'earth',
  observationPoint: 'earth',
  selectedBody: 'mars',
  zodiacScheme: 'signs',
  sphereCentre: 'frame',
  scaleMode: 'compressed',
  zoom: 1,
  panX: 0,
  panY: 0,
  showOrbits: true,
  showSightLines: true,
  showStarFigures: true,
  showConstruction: true,
  showTrack: false,
  locale: 'cs',
  theme: 'orrery',
  showCalculation: false,
  showWelcome: false,
  showNotes: true,
  julianDate: JD,
  playing: false,
  rateDaysPerSecond: 1,
} as State;

/** Every engine with machinery to draw, including the two that draw none. */
const ENGINE_IDS: EngineId[] = [
  'ptolemaic-epicyclic',
  'ptolemaic-almagest',
  'ptolemaic-reframe',
  'copernican',
  'circular',
  'keplerian',
  'nbody',
];

const VECTOR_ROLES: HarnessRole[] = ['velocity', 'net-force', 'gravity'];

/** What is on screen: every part of every construction the app can put there. */
function* everyPart(): Generator<{
  state: State;
  bodyId: BodyId;
  role: HarnessRole;
  markerIndex?: number;
  source?: BodyId;
}> {
  for (const engineId of ENGINE_IDS) {
    const state: State = { ...STATE, engineId, selectedBody: 'mars' };

    for (const bodyId of BODY_IDS) {
      const raw = rawConstruction(state, bodyId);
      if (raw) {
        const { construction } = raw;
        const roles = new Set<HarnessRole>([
          ...construction.circles.map((circle) => circle.role),
          ...(construction.ellipses ?? []).map((ellipse) => ellipse.role),
          ...construction.arms.map((arm) => arm.role),
        ]);
        for (const role of roles) yield { state, bodyId, role };

        for (const [markerIndex, marker] of construction.markers.entries()) {
          yield { state, bodyId, role: marker.role, markerIndex };
        }
      }

      // Newton's machinery is not a construction, and every pull is its own part.
      for (const role of VECTOR_ROLES) {
        const part = measureHarnessPart(state, bodyId, role, { source: 'sun' });
        if (part) yield { state, bodyId, role, source: 'sun' };
      }
    }
  }
}

describe('the harness explains itself', () => {
  const parts = [...everyPart()];

  it('finds a part to describe in every model', () => {
    // A guard on the walk itself: if `rawConstruction` quietly stopped
    // returning anything, every assertion below would pass on an empty set.
    expect(parts.length).toBeGreaterThan(100);
  });

  it('has a name, an explanation and labelled figures in both languages', () => {
    const missing: string[] = [];

    for (const { state, bodyId, role, markerIndex, source } of parts) {
      const part = measureHarnessPart(state, bodyId, role, { markerIndex, source });
      if (!part) continue;

      const keys = [
        harnessTitleKey(part),
        harnessNoteKey(part),
        ...part.measures.map((measure) => harnessValueKey(part, measure)),
      ];
      // A pull is titled after the body exerting it, which is the one part
      // whose title key is shared rather than per-role.
      if (part.role === 'gravity') keys[0] = 'harness.part.gravity';

      for (const [locale, dictionary] of DICTIONARIES) {
        for (const key of keys) {
          if (!(key in dictionary)) {
            missing.push(`${locale}: ${key} (${state.engineId} ${bodyId} ${role})`);
          }
        }
      }
    }

    expect([...new Set(missing)]).toEqual([]);
  });

  it('substitutes every placeholder either language reaches for', () => {
    const unknown: string[] = [];

    for (const [locale, dictionary] of DICTIONARIES) {
      for (const [key, text] of Object.entries(dictionary)) {
        // Only the notes and the part names are substituted this way; the
        // panel's own strings are filled by their own callers.
        if (!key.startsWith('harness.note.') && !key.startsWith('harness.part.')) continue;
        for (const match of text.matchAll(/\{\{(\w+)\}\}/g)) {
          const name = match[1]!;
          if (!PLACEHOLDERS.includes(name)) unknown.push(`${locale}: ${key} {{${name}}}`);
        }
      }
    }

    expect(unknown).toEqual([]);
  });

  it('leaves nothing unsubstituted in a rendered note', () => {
    const rendered: string[] = [];

    for (const { state, bodyId, role, markerIndex, source } of parts) {
      const note = harnessNote(state, bodyId, role, { markerIndex, source });
      if (!note) continue;
      if (note.body.includes('{{') || note.title.includes('{{')) {
        rendered.push(`${state.engineId} ${bodyId} ${role}`);
      }
      expect(note.values.length).toBeGreaterThan(0);
    }

    expect(rendered).toEqual([]);
  });

  it('picks the wording for the machinery actually running', () => {
    const ptolemy: State = { ...STATE, engineId: 'ptolemaic-epicyclic' };
    const kepler: State = { ...STATE, engineId: 'keplerian' };

    // The same role, three different things being described.
    const deferent = measureHarnessPart(ptolemy, 'mars', 'deferent')!;
    expect(harnessNoteKey(deferent)).toBe('harness.note.deferent.ptolemaic');
    expect(harnessNoteKey(measureHarnessPart(ptolemy, 'io', 'deferent')!)).toBe(
      'harness.note.deferent.ptolemaic.satellite',
    );
    expect(harnessNoteKey(measureHarnessPart(kepler, 'mars', 'orbit')!)).toBe(
      'harness.note.orbit.kepler',
    );

    // And the two foci, which are drawn identically and mean opposite things.
    const foci = [0, 1].map(
      (markerIndex) => measureHarnessPart(kepler, 'mars', 'focus', { markerIndex })!,
    );
    expect(foci.map(harnessNoteKey).sort()).toEqual([
      'harness.note.focus.empty',
      'harness.note.focus.occupied',
    ]);
  });

  it("quotes Ptolemy's parameters the way Ptolemy quotes them", () => {
    expect(sexagesimal(39.5)).toBe('39;30');
    expect(sexagesimal(6)).toBe('6;0');
    expect(sexagesimal(3.4167)).toBe('3;25');
    // Carrying, rather than the 2;60 that rounding each half separately gives.
    expect(sexagesimal(2.9999)).toBe('3;0');

    const epicycle = measureHarnessPart(
      { ...STATE, engineId: 'ptolemaic-epicyclic' },
      'mars',
      'epicycle',
    )!;
    expect(describeHarnessPart(epicycle).values[0]?.value).toContain('39;30');
  });
});
