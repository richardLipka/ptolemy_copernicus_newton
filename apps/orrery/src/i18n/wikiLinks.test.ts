/**
 * The linking is done by pattern-matching prose, which is exactly the sort of
 * thing that works on the sentence it was written for and quietly mangles the
 * next one. These are the ways it can go wrong.
 *
 * The DOM half is not tested here — the environment is plain Node with no
 * `document`. `segments` is the pure half, split out for that reason, the same
 * way `labelHasRoom` and `mapProjection` were.
 */

import { describe, expect, it } from 'vitest';

import { segments, wikiHref, WIKI_ENTITIES } from './wikiLinks';
import cs from './cs.json';
import en from './en.json';

const CS = cs as Record<string, string>;
const EN = en as Record<string, string>;

/** Just the linked runs, as [surface form, article title] pairs. */
const links = (text: string, locale: 'cs' | 'en'): [string, string][] =>
  segments(text, locale)
    .filter((segment) => segment.title !== undefined)
    .map((segment) => [segment.text, segment.title!]);

describe('finding a name', () => {
  it('links a person, a book and a planet', () => {
    expect(links('Ptolemy put Mars on an epicycle in the Almagest.', 'en')).toEqual([
      ['Ptolemy', 'Ptolemy'],
      ['Mars', 'Mars'],
      ['Almagest', 'Almagest'],
    ]);
  });

  it('takes the possessive with the name', () => {
    expect(links("Kepler's ellipse", 'en')).toEqual([["Kepler's", 'Johannes Kepler']]);
  });

  it('follows Czech through its declensions', () => {
    // Every one of these forms appears in cs.json.
    for (const form of ['Ptolemaios', 'Ptolemaia', 'Ptolemaiovy', 'Ptolemaiovými']) {
      expect(links(`Text ${form} text`, 'cs'), form).toEqual([[form, 'Klaudios Ptolemaios']]);
    }
  });

  it('links each name once, however often it is repeated', () => {
    const text = 'The Sun, and again the Sun, and once more the Sun.';
    expect(links(text, 'en')).toEqual([['Sun', 'Sun']]);
  });

  it('keeps the text whole when it links nothing', () => {
    const text = 'A circle carried on another circle.';
    expect(segments(text, 'en')).toEqual([{ text }]);
  });

  it('reassembles to exactly the input', () => {
    for (const [locale, dictionary] of [
      ['cs', CS],
      ['en', EN],
    ] as const) {
      for (const value of Object.values(dictionary)) {
        const joined = segments(value, locale)
          .map((segment) => segment.text)
          .join('');
        expect(joined, `${locale}: ${value.slice(0, 40)}`).toBe(value);
      }
    }
  });
});

describe('not finding one where there is none', () => {
  /*
   * The trap this whole scheme rests on. Czech `měsíc` is a month and `Měsíc`
   * is the Moon; `newtonů` is a unit of force and `Newton` is a man. Case is
   * the only thing that tells them apart.
   */
  it('leaves lower-case common nouns alone', () => {
    expect(links('Perioda je jeden měsíc a síla pár newtonů.', 'cs')).toEqual([]);
    expect(links('the sun rose and the earth turned', 'en')).toEqual([]);
  });

  it('does not match a name inside a longer word', () => {
    expect(links('Marseille', 'en')).toEqual([]);
    expect(links('Sunday', 'en')).toEqual([]);
    expect(links('Earthenware', 'en')).toEqual([]);
  });

  /*
   * "Longitude" is a common noun in this app — "Longitude runs to the right" —
   * and a proper one only in "Longitude Prize". Only the phrase is a pattern.
   */
  it('links Longitude only as the prize', () => {
    expect(links('Longitude runs to the right, latitude upward.', 'en')).toEqual([]);
    expect(links('won a share of the Longitude Prize', 'en')).toEqual([
      ['Longitude Prize', 'Longitude rewards'],
    ]);
  });

  it('reads Newton–Raphson as the method, not the man', () => {
    expect(links('Newton–Raphson passes', 'en')).toEqual([
      ['Newton–Raphson', "Newton's method"],
    ]);
  });

  /*
   * The Czech stems are bounded so they cannot run on into a longer word:
   * Slunc + 2 reaches Sluncem and stops short of sluneční.
   */
  it('stops a stem before the next word that merely starts the same', () => {
    expect(links('sluneční soustava', 'cs')).toEqual([]);
    expect(links('Slunce a Sluncem', 'cs')).toEqual([['Slunce', 'Slunce']]);
  });
});

describe('the table itself', () => {
  it('builds a real article URL', () => {
    expect(wikiHref('en', 'Mercury (planet)')).toBe(
      'https://en.wikipedia.org/wiki/Mercury_(planet)',
    );
    expect(wikiHref('cs', 'Klaudios Ptolemaios')).toBe(
      'https://cs.wikipedia.org/wiki/Klaudios_Ptolemaios',
    );
  });

  it('gives every entity an id usable as a regex group name', () => {
    for (const entity of WIKI_ENTITIES) {
      expect(entity.id, entity.id).toMatch(/^[A-Za-z][A-Za-z0-9]*$/);
    }
  });

  it('has no duplicate ids', () => {
    const ids = WIKI_ENTITIES.map((entity) => entity.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries at least one language per entity', () => {
    for (const entity of WIKI_ENTITIES) {
      expect(Boolean(entity.cs || entity.en), entity.id).toBe(true);
    }
  });

  /*
   * Not a style rule — a correctness one. Alternation takes the first branch
   * that matches, so a pattern that is a prefix of a later one would swallow
   * it: "Newton" listed before "Newton–Raphson" means the method never links.
   */
  it('orders patterns so no earlier one shadows a later one', () => {
    for (const locale of ['cs', 'en'] as const) {
      const listed = WIKI_ENTITIES.map((entity) => entity[locale]).filter(
        (article): article is NonNullable<typeof article> => Boolean(article),
      );
      for (let i = 0; i < listed.length; i++) {
        for (let j = i + 1; j < listed.length; j++) {
          const earlier = new RegExp(`^(?:${listed[i]!.pattern})$`, 'u');
          // A later pattern's own literal prefix must not be fully matched by
          // an earlier one, or the earlier branch wins at that position.
          const laterLiteral = listed[j]!.pattern.replace(/\\p\{L\}\{\d+,\d+\}/g, '');
          if (/^[\p{L} –-]+$/u.test(laterLiteral)) {
            expect(
              earlier.test(laterLiteral),
              `${locale}: "${listed[i]!.title}" shadows "${listed[j]!.title}"`,
            ).toBe(false);
          }
        }
      }
    }
  });
});

describe('over the real dictionaries', () => {
  const prose = (dictionary: Record<string, string>) =>
    Object.entries(dictionary).filter(([, value]) => value.length > 60);

  it('finds the names the explanatory text actually contains', () => {
    const found = new Set<string>();
    for (const [, value] of prose(EN)) {
      for (const [, title] of links(value, 'en')) found.add(title);
    }
    // A spot-check across all four categories the linking is meant to cover.
    for (const title of [
      'Ptolemy',
      'Johannes Kepler',
      'Almagest',
      'Rudolphine Tables',
      'Paris',
      'Mars',
    ]) {
      expect(found.has(title), title).toBe(true);
    }
  });

  it('links something in both languages, and never a bare pattern artefact', () => {
    for (const [locale, dictionary] of [
      ['cs', CS],
      ['en', EN],
    ] as const) {
      let linked = 0;
      for (const [, value] of prose(dictionary)) {
        for (const [surface] of links(value, locale)) {
          // A match is always a real run of the source text, never empty.
          expect(surface.length, `${locale}: empty match`).toBeGreaterThan(0);
          expect(value.includes(surface), `${locale}: ${surface}`).toBe(true);
          linked++;
        }
      }
      expect(linked, locale).toBeGreaterThan(20);
    }
  });
});
