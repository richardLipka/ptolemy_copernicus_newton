/**
 * The dictionaries are the one part of this app meant to be edited by someone
 * who is not going to run it.
 *
 * A wrong number in an engine shows up as a planet in the wrong place. A wrong
 * *key* shows up as nothing at all — `t` returns the key itself, so a typo
 * renders as `harness.note.deferent` in the middle of a sentence, and only in
 * the language nobody on the project reads by preference. These checks are what
 * stands between a translator's edit and that.
 *
 * What is deliberately *not* checked here: whether a key is still referenced by
 * the code. Keys are built at runtime from ids — `zodiac.${division.id}`,
 * `body.${id}`, `harness.note.${role}.${family}` — so any "unused key" scan is
 * guesswork, and a scan that cries wolf is one a contributor learns to skip.
 * `harnessNotes.test.ts` renders every note the app can reach and insists on a
 * real wording for all of it, which is the version of this worth having.
 */

import { describe, expect, it } from 'vitest';
import { BODY_IDS } from '@orrery/core/bodies';

import cs from './cs.json';
import en from './en.json';

/*
 * Widened to a plain string map on the way in.
 *
 * TypeScript types a JSON import as an object literal with one property per
 * key, which is useless here: every check in this file looks keys up by a name
 * computed at runtime, and against the literal type each of those is an error.
 */
const CS = cs as Record<string, string>;
const EN = en as Record<string, string>;

const DICTIONARIES: readonly (readonly [string, Record<string, string>])[] = [
  ['cs', CS],
  ['en', EN],
];

/** `{{name}}` placeholders in a string, sorted so two strings compare equal. */
const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]!).sort();

describe('the two dictionaries stay in step', () => {
  it('carries exactly the same keys in both languages', () => {
    const czech = Object.keys(CS).sort();
    const english = Object.keys(EN).sort();

    // Reported as the differences rather than as two long lists, so a failure
    // names the key that was added on one side and forgotten on the other.
    expect(czech.filter((key) => !(key in EN))).toEqual([]);
    expect(english.filter((key) => !(key in CS))).toEqual([]);
  });

  it('has no empty string anywhere', () => {
    const empty: string[] = [];
    for (const [locale, dictionary] of DICTIONARIES) {
      for (const [key, text] of Object.entries(dictionary)) {
        if (text.trim() === '') empty.push(`${locale}: ${key}`);
      }
    }
    expect(empty).toEqual([]);
  });

  /*
   * Placeholder parity, everywhere except the harness notes.
   *
   * The harness is exempt because Czech genuinely needs a different placeholder
   * there: English fills one `{{centreOf}}` where Czech picks between the
   * nominative `{{centre}}` and the genitive, and both are supplied. That set is
   * covered properly by `harnessNotes.test.ts`, which renders every note the app
   * can produce. Everywhere else the two languages take the same values from the
   * same call, so a placeholder on one side and not the other is a real bug —
   * it reaches the screen as a literal `{{body}}`.
   */
  it('asks for the same values in both languages', () => {
    const mismatched: string[] = [];
    for (const key of Object.keys(EN)) {
      if (key.startsWith('harness.')) continue;
      const english = placeholders(EN[key]!).join(',');
      const czech = placeholders(CS[key] ?? '').join(',');
      if (english !== czech) mismatched.push(`${key} — en:{${english}} cs:{${czech}}`);
    }
    expect(mismatched).toEqual([]);
  });

  /*
   * Every body needs both cases, in both languages.
   *
   * These moved here out of `core/bodies.ts`, where they sat beside the orbital
   * elements and were read by exactly one line of the app. Half the body names
   * on screen come from `t('body.mars')` and half from `bodyName()`, and now
   * that both read the dictionary a missing genitive is the failure mode: the
   * phase caption would read "as seen from body.mars.genitive".
   */
  it('names every body in both cases', () => {
    const missing: string[] = [];
    for (const [locale, dictionary] of DICTIONARIES) {
      for (const id of BODY_IDS) {
        if (!(`body.${id}` in dictionary)) missing.push(`${locale}: body.${id}`);
        if (!(`body.${id}.genitive` in dictionary)) {
          missing.push(`${locale}: body.${id}.genitive`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('every key the code names by hand exists', () => {
  /*
   * Keys spelled out as literals — `t('info.title')` and the `labelKey` fields
   * the calculation sheet carries in core. Runtime-built keys are out of reach
   * of a regex and are left to the tests that actually render them.
   *
   * Both roots are walked because core names dictionary keys too: `calculation.ts`
   * labels its working rows with them, which is the right split (core says which
   * line this is, the app says how to word it) but does put a key the app must
   * satisfy in a package that cannot see the dictionary.
   */
  /*
   * Read through Vite rather than through `node:fs`.
   *
   * The app compiles against `lib: DOM` with no `@types/node` — deliberately,
   * so nothing in `src` can reach for a filesystem that will not be there in a
   * browser. A test living in `src` is held to the same rule, and `import.meta.glob`
   * is the way in: Vite inlines the matches at transform time, which is also why
   * these paths have to be literals rather than built from a variable.
   */
  const modules = {
    ...import.meta.glob('../**/*.ts', { query: '?raw', import: 'default', eager: true }),
    ...import.meta.glob('../../../../packages/core/src/**/*.ts', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  } as Record<string, string>;

  const sources = Object.entries(modules)
    .filter(([path]) => !path.endsWith('.test.ts') && !path.endsWith('.d.ts'))
    .map(([path, text]) => ({ path, text }));

  const referencesIn = (text: string): string[] =>
    [
      ...text.matchAll(/\bt\(\s*'([^']+)'/g),
      ...text.matchAll(/labelKey:\s*'([^']+)'/g),
      ...text.matchAll(/costKey:\s*'([^']+)'/g),
    ].map((match) => match[1]!);

  const found = new Set(sources.flatMap((source) => referencesIn(source.text)));

  /*
   * The check below can only fail if the scan read something, and `?raw` has a
   * quiet failure mode where it resolves to an empty string. So this asserts on
   * the keys actually recovered rather than on the file count: a glob that
   * matched every file and read none of them still passes a length check.
   */
  it('actually read the source it means to scan', () => {
    expect(sources.length).toBeGreaterThan(20);
    expect(found.size).toBeGreaterThan(50);
  });

  it('resolves in both languages', () => {
    const broken: string[] = [];
    for (const { path, text } of sources) {
      for (const key of referencesIn(text)) {
        for (const [locale, dictionary] of DICTIONARIES) {
          if (!(key in dictionary)) broken.push(`${locale}: ${key} — ${path}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });
});
