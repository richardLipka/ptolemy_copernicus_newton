/**
 * Names in the explanatory text, linked to Wikipedia.
 *
 * The app names a lot of people, books and planets in passing — Reinhold's
 * *Prutenic Tables*, Gassendi watching a transit in Paris, the equation of
 * centre — and assumes the reader either knows them or does not mind. Linking
 * them costs the reader nothing and turns each mention into a way out of the
 * app for anyone who wants one.
 *
 * **The dictionaries stay plain text.** No markup was added to `cs.json` or
 * `en.json`: they remain the flat, editable files §9 promises, and a translator
 * never has to write or preserve a link. The matching happens here instead,
 * against a table of names, which means a rewording of a sentence cannot break
 * a link and adding a name is a line in one file.
 *
 * Three rules keep the matching honest:
 *
 *  - **Case-sensitive, always.** Czech *měsíc* is a month and *Měsíc* is the
 *    Moon; *newtonů* is a unit and *Newton* is a man. Case is the only thing
 *    separating them, and lowercasing the comparison would link both.
 *  - **Stems, not word lists, for Czech.** The language declines: Ptolemaios
 *    appears in this app as Ptolemaia, Ptolemaiem, Ptolemaiovi, Ptolemaiovy,
 *    Ptolemaiova, Ptolemaiovo, Ptolemaiův, Ptolemaiovu and Ptolemaiovými. A
 *    stem plus a bounded run of letters covers the set; a list would be
 *    out of date the first time somebody wrote a sentence differently.
 *  - **One link per name per block.** "Sun" occurs thirteen times across the
 *    notes and "Earth" ten. Linking every one would turn a paragraph into a
 *    hedge of underlines and say nothing the first did not.
 *
 * Every title below was checked against the live API of the wiki it belongs to
 * before it was written down. Where an article exists in one language and not
 * the other — the *Alfonsine tables* have no Czech page — the name is simply
 * left as text in that language rather than sent across to a wiki the reader
 * did not ask for.
 */

import { getLocale, type Locale } from './i18n';

interface Article {
  /** Exact article title, as the wiki spells it. */
  title: string;
  /**
   * Surface forms, as a regex source. Written against the *app's* spelling,
   * which need not be the wiki's: the text says "Rudolfinské", the Czech
   * article is at "Rudolfínské tabulky", and only the href has to be right.
   */
  pattern: string;
}

interface WikiEntity {
  /** Also the regex group name, so it must stay a bare identifier. */
  id: string;
  cs?: Article;
  en?: Article;
}

/*
 * Order matters: alternation takes the first branch that matches at a given
 * position, so anything that is a prefix of something longer has to come after
 * it. "Newton–Raphson" is the method and must win over "Newton" the man.
 */
const ENTITIES: readonly WikiEntity[] = [
  // --- methods and works whose names contain another name ------------------
  {
    id: 'newtonRaphson',
    en: { title: "Newton's method", pattern: 'Newton[–-]Raphson' },
    cs: { title: 'Newtonova metoda', pattern: 'Newton[–-]Raphson\\p{L}{0,3}' },
  },
  {
    id: 'deRevolutionibus',
    en: { title: 'De revolutionibus orbium coelestium', pattern: 'De revolutionibus' },
    cs: { title: 'De revolutionibus orbium coelestium', pattern: 'De revolutionibus' },
  },
  {
    id: 'rudolphineTables',
    en: { title: 'Rudolphine Tables', pattern: 'Rudolphine Tables' },
    cs: { title: 'Rudolfínské tabulky', pattern: 'Rudolfínsk\\p{L}{0,4}|Rudolfinsk\\p{L}{0,4}' },
  },
  // No Czech article; English readers get the link, Czech readers get the text.
  { id: 'alfonsineTables', en: { title: 'Alfonsine tables', pattern: 'Alfonsine Tables' } },
  { id: 'prutenicTables', en: { title: 'Prutenic Tables', pattern: 'Prutenic Tables' } },
  { id: 'handyTables', en: { title: 'Handy Tables', pattern: 'Handy Tables' } },
  { id: 'longitudePrize', en: { title: 'Longitude rewards', pattern: 'Longitude Prize' } },

  // --- books ---------------------------------------------------------------
  {
    id: 'almagest',
    en: { title: 'Almagest', pattern: 'Almagest' },
    cs: { title: 'Almagest', pattern: 'Almagest\\p{L}{0,2}' },
  },
  {
    id: 'principia',
    en: { title: 'Philosophiæ Naturalis Principia Mathematica', pattern: 'Principia' },
    cs: { title: 'Philosophiae Naturalis Principia Mathematica', pattern: 'Principi\\p{L}' },
  },

  // --- people --------------------------------------------------------------
  {
    id: 'ptolemy',
    en: { title: 'Ptolemy', pattern: 'Ptolemy(?:’s|\'s)?' },
    cs: { title: 'Klaudios Ptolemaios', pattern: 'Ptolemai\\p{L}{0,7}' },
  },
  {
    id: 'copernicus',
    en: { title: 'Nicolaus Copernicus', pattern: 'Copernicus(?:’s|\'s)?' },
    cs: { title: 'Mikuláš Koperník', pattern: 'Koperník\\p{L}{0,6}' },
  },
  {
    id: 'kepler',
    en: { title: 'Johannes Kepler', pattern: 'Kepler(?:’s|\'s)?' },
    cs: { title: 'Johannes Kepler', pattern: 'Kepler\\p{L}{0,6}' },
  },
  {
    id: 'newton',
    en: { title: 'Isaac Newton', pattern: 'Newton(?:’s|\'s)?' },
    cs: { title: 'Isaac Newton', pattern: 'Newton\\p{L}{0,6}' },
  },
  {
    id: 'tycho',
    en: { title: 'Tycho Brahe', pattern: 'Tycho(?: Brahe)?(?:’s|\'s)?' },
    cs: { title: 'Tycho Brahe', pattern: 'Tychon\\p{L}{0,6}|Tycho\\b' },
  },
  {
    id: 'galileo',
    en: { title: 'Galileo Galilei', pattern: 'Galileo(?: Galilei)?(?:’s|\'s)?' },
    cs: { title: 'Galileo Galilei', pattern: 'Galile\\p{L}{0,3}' },
  },
  {
    id: 'gassendi',
    en: { title: 'Pierre Gassendi', pattern: 'Gassendi' },
    cs: { title: 'Pierre Gassendi', pattern: 'Gassendi\\p{L}{0,2}' },
  },
  {
    id: 'napier',
    en: { title: 'John Napier', pattern: 'Napier(?:’s|\'s)?' },
    cs: { title: 'John Napier', pattern: 'Napier\\p{L}{0,6}' },
  },
  {
    id: 'reinhold',
    en: { title: 'Erasmus Reinhold', pattern: 'Reinhold(?:’s|\'s)?' },
    cs: { title: 'Erasmus Reinhold', pattern: 'Reinhold\\p{L}{0,4}' },
  },
  {
    id: 'laplace',
    en: { title: 'Pierre-Simon Laplace', pattern: 'Laplace' },
    cs: { title: 'Pierre-Simon Laplace', pattern: 'Laplace\\p{L}{0,2}' },
  },
  {
    id: 'leVerrier',
    en: { title: 'Urbain Le Verrier', pattern: 'Le Verrier' },
    cs: { title: 'Urbain Le Verrier', pattern: '(?:Le )?Verrier\\p{L}{0,2}' },
  },
  {
    id: 'newcomb',
    en: { title: 'Simon Newcomb', pattern: 'Newcomb' },
    cs: { title: 'Simon Newcomb', pattern: 'Newcomb\\p{L}{0,2}' },
  },
  {
    id: 'mayer',
    en: { title: 'Tobias Mayer', pattern: 'Mayer(?:’s|\'s)?' },
    cs: { title: 'Tobias Mayer', pattern: 'Mayer\\p{L}{0,4}' },
  },

  // --- places --------------------------------------------------------------
  {
    id: 'paris',
    en: { title: 'Paris', pattern: 'Paris' },
    cs: { title: 'Paříž', pattern: 'Paříž\\p{L}{0,2}' },
  },
  { id: 'babylon', en: { title: 'Babylonian astronomy', pattern: 'Babylonian' } },

  /*
   * --- bodies --------------------------------------------------------------
   *
   * The Czech stems are cut short on purpose. `Slunc` plus two letters takes
   * Slunce, Slunci and Sluncem and stops before *sluneční*; `Zem` plus two
   * takes Země and Zemi without reaching for a longer word that merely starts
   * the same way. Bounding the run is what keeps a stem from becoming a
   * prefix search.
   */
  {
    id: 'sun',
    en: { title: 'Sun', pattern: 'Sun(?:’s|\'s)?' },
    cs: { title: 'Slunce', pattern: 'Slunc\\p{L}{1,2}' },
  },
  {
    id: 'mercury',
    en: { title: 'Mercury (planet)', pattern: 'Mercury(?:’s|\'s)?' },
    cs: { title: 'Merkur (planeta)', pattern: 'Merkur\\p{L}{0,2}' },
  },
  {
    id: 'venus',
    en: { title: 'Venus', pattern: 'Venus(?:’s|\'s)?' },
    cs: { title: 'Venuše (planeta)', pattern: 'Venuš\\p{L}{1,2}' },
  },
  {
    id: 'earth',
    en: { title: 'Earth', pattern: 'Earth(?:’s|\'s)?' },
    cs: { title: 'Země', pattern: 'Zem\\p{L}{1,2}' },
  },
  {
    id: 'moon',
    en: { title: 'Moon', pattern: 'Moon(?:’s|\'s)?' },
    cs: { title: 'Měsíc', pattern: 'Měsíc\\p{L}{0,2}' },
  },
  {
    id: 'mars',
    en: { title: 'Mars', pattern: 'Mars(?:’s|\'s)?' },
    cs: { title: 'Mars (planeta)', pattern: 'Mars\\p{L}{0,2}' },
  },
  {
    id: 'jupiter',
    en: { title: 'Jupiter', pattern: 'Jupiter(?:’s|\'s)?' },
    cs: { title: 'Jupiter (planeta)', pattern: 'Jupiter\\p{L}{0,2}' },
  },
  {
    id: 'saturn',
    en: { title: 'Saturn', pattern: 'Saturn(?:’s|\'s)?' },
    cs: { title: 'Saturn (planeta)', pattern: 'Saturn\\p{L}{0,2}' },
  },
];

/** A run of text, and the article it points at if it names one. */
export interface Segment {
  text: string;
  /** Absent for ordinary prose. */
  title?: string;
  /** Absent for ordinary prose. */
  href?: string;
}

const CACHE = new Map<Locale, { regex: RegExp; byGroup: Map<string, Article> } | null>();

function matcherFor(locale: Locale) {
  const cached = CACHE.get(locale);
  if (cached !== undefined) return cached;

  const byGroup = new Map<string, Article>();
  const branches: string[] = [];
  for (const entity of ENTITIES) {
    const article = entity[locale];
    if (!article) continue;
    byGroup.set(entity.id, article);
    branches.push(`(?<${entity.id}>${article.pattern})`);
  }

  /*
   * Word boundaries on both ends, so a name is only matched as a whole word.
   * \b is unreliable next to accented letters under the u flag, so the edges
   * are written as explicit lookarounds against the letter class itself.
   */
  const built = branches.length
    ? {
        regex: new RegExp(`(?<![\\p{L}\\p{N}])(?:${branches.join('|')})(?![\\p{L}\\p{N}])`, 'gu'),
        byGroup,
      }
    : null;
  CACHE.set(locale, built);
  return built;
}

export const wikiHref = (locale: Locale, title: string): string =>
  `https://${locale}.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

/**
 * Split a string into plain runs and linked names.
 *
 * Pure, and separate from the DOM half on purpose: the test environment is
 * plain Node with no `document`, so this is the part that can be tested — the
 * same split `labelHasRoom` and `mapProjection` are written for.
 */
export function segments(text: string, locale: Locale): Segment[] {
  const matcher = matcherFor(locale);
  if (!matcher) return [{ text }];

  const out: Segment[] = [];
  const used = new Set<string>();
  let last = 0;

  for (const match of text.matchAll(matcher.regex)) {
    const groups = match.groups ?? {};
    const id = Object.keys(groups).find((key) => groups[key] !== undefined);
    if (!id || used.has(id)) continue;

    const article = matcher.byGroup.get(id);
    if (!article) continue;
    used.add(id);

    const at = match.index ?? 0;
    if (at > last) out.push({ text: text.slice(last, at) });
    out.push({ text: match[0], title: article.title, href: wikiHref(locale, article.title) });
    last = at + match[0].length;
  }

  if (last < text.length) out.push({ text: text.slice(last) });
  return out.length ? out : [{ text }];
}

/**
 * The same split, as nodes.
 *
 * `noreferrer` alongside `noopener` because these leave the app entirely and
 * the destination has no business knowing which panel the reader came from.
 */
export function linkify(text: string): DocumentFragment {
  const locale = getLocale();
  const fragment = document.createDocumentFragment();

  for (const segment of segments(text, locale)) {
    if (!segment.href) {
      fragment.appendChild(document.createTextNode(segment.text));
      continue;
    }
    const anchor = document.createElement('a');
    anchor.className = 'wiki-link';
    anchor.href = segment.href;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = segment.text;
    anchor.title = segment.title ?? segment.text;
    fragment.appendChild(anchor);
  }

  return fragment;
}

/** Exposed for the tests, which check every title is reachable and unique. */
export const WIKI_ENTITIES = ENTITIES;
