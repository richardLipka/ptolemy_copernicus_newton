/**
 * The pure half of the shared export plumbing: filenames and XML escaping.
 *
 * `resolveThemeColor`, `svgDocument`'s rendering and the canvas/download path
 * all need a real browser and are checked by hand in the app — see the file
 * note in `svgDocument.ts` for why nothing here goes through a DOM snapshot
 * that a test could stand in for anyway.
 */

import { describe, expect, it } from 'vitest';

import { buildExportFilename, escapeXml, sanitizeFilenamePart } from './svgDocument';

describe('escapeXml', () => {
  it('escapes the characters XML text cannot contain literally', () => {
    // The app's own dictionary has exactly this — "Calculation & demonstrations" —
    // and it is what first exposed the foreignObject approach's other failure
    // mode: CSS Nesting's `&` combinator, unescaped, breaking the XML parse
    // outright. Nothing here goes through CSS text any more, but a translated
    // string is still free author content and gets no less care.
    expect(escapeXml('Calculation & demonstrations')).toBe('Calculation &amp; demonstrations');
    expect(escapeXml('a < b > c')).toBe('a &lt; b &gt; c');
    expect(escapeXml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it("leaves ordinary text — including the app's own accents and symbols — alone", () => {
    expect(escapeXml('Ptolemaios')).toBe('Ptolemaios');
    expect(escapeXml('23,2°')).toBe('23,2°');
    expect(escapeXml('39;30')).toBe('39;30');
  });
});

describe('sanitizeFilenamePart', () => {
  it('turns spaces and punctuation into hyphens', () => {
    expect(sanitizeFilenamePart('ptolemaic-epicyclic')).toBe('ptolemaic-epicyclic');
    expect(sanitizeFilenamePart('2026-03-15')).toBe('2026-03-15');
  });

  it('drops characters a save dialog would choke on', () => {
    // A degree sign and a colon are both invalid in a Windows filename.
    expect(sanitizeFilenamePart('139.4°')).toBe('139-4');
    expect(sanitizeFilenamePart('16:00 UT')).toBe('16-00-ut');
  });

  it('folds accents to plain letters instead of dropping them', () => {
    expect(sanitizeFilenamePart('Ptolemaios')).toBe('ptolemaios');
    expect(sanitizeFilenamePart('Země')).toBe('zeme');
  });

  it('never returns a leading or trailing hyphen', () => {
    expect(sanitizeFilenamePart('  mars  ')).toBe('mars');
    expect(sanitizeFilenamePart('***')).toBe('');
  });
});

describe('buildExportFilename', () => {
  it('joins the given parts with hyphens', () => {
    expect(buildExportFilename(['orrery', 'ptolemaic-epicyclic', 'mars'], 'svg')).toBe(
      'orrery-ptolemaic-epicyclic-mars.svg',
    );
  });

  it('drops empty and missing parts rather than leaving a gap', () => {
    expect(buildExportFilename(['orrery', null, 'mars', undefined, ''], 'png')).toBe(
      'orrery-mars.png',
    );
  });

  it('carries the requested extension through unchanged', () => {
    expect(buildExportFilename(['phase', 'venus'], 'png')).toMatch(/\.png$/);
    expect(buildExportFilename(['phase', 'venus'], 'svg')).toMatch(/\.svg$/);
  });
});
