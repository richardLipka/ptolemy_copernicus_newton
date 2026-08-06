/**
 * The longitude-against-time strip: what an observer would have written down.
 *
 * Drawn the same way as everything else here — DOM elements positioned by CSS
 * custom properties, no canvas — so the curve is a chain of rotated hairlines
 * exactly as the orbit trails are. See §6 of CLAUDE.md for why that constraint
 * holds across the whole app.
 *
 * Coordinates inside the plot run 0–1 in both axes: `--x` is the fraction of
 * the window elapsed and `--y` the fraction of the way *down* from 360° to 0°.
 * Longitude increases upward, as it does on the zodiac ring, so the eye reads a
 * rising curve as eastward motion through the signs.
 *
 * The strip is rebuilt rather than updated in place. It is off by default, it is
 * not on the animation path, and the whole curve changes whenever the model,
 * body, observer or window does — which is nearly every input it has.
 */

import type { BodyId } from '@orrery/core/bodies';
import type { LongitudeTrack } from '@orrery/core/longitudeTrack';
import type { ZodiacScheme } from '@orrery/core/zodiac';
import { bodyName, t } from '../../i18n/i18n';
import { dateFromJd } from '@orrery/core/time';
import { divisionsFor } from '@orrery/core/zodiac';
import { normalizeDeg } from '@orrery/core/vec';
import { el } from '../../ui/dom';

const div = (className: string): HTMLDivElement => {
  const element = document.createElement('div');
  element.className = className;
  return element;
};

/** Where a longitude sits in the plot, 0 at the top (360°) to 1 at the bottom. */
const yOf = (longitude: number): number => 1 - longitude / 360;

export interface TrackStripInput {
  track: LongitudeTrack;
  target: BodyId;
  observer: BodyId;
  /** Current date, for the playhead. */
  julianDate: number;
  /**
   * One full cycle of the apparent motion, days — the physical quantity.
   *
   * Distinct from the window, which is a little over it and is bounded below.
   * Both are shown, because a strip labelled only with its own width invites
   * the question of why Saturn reads 435 days when its synodic period is 378.
   */
  cycleDays: number;
  /** Zodiac scheme, so the axis is labelled the way the ring is. */
  zodiacScheme: ZodiacScheme;
  /**
   * The offset the ring applies to its divisions, degrees. Passed in rather
   * than recomputed so the two can never drift apart.
   */
  precession: number;
}

/** Format a Julian date as a bare year, which is all an axis end needs. */
const yearOf = (jd: number): string => String(dateFromJd(jd).getUTCFullYear());

export function renderTrackStrip(container: HTMLElement, input: TrackStripInput): void {
  container.replaceChildren();

  const { track, target, observer, julianDate } = input;
  const span = track.endJd - track.startJd;
  if (!(span > 0)) return;

  const strip = div('track');

  // --- heading ----------------------------------------------------------

  const heading = div('track__heading');
  heading.appendChild(
    el('span', 'track__title', t('track.title', { body: bodyName(target) })),
  );
  heading.appendChild(
    el('span', 'track__from', t('info.asSeenFrom', { body: bodyName(observer, 'genitive') })),
  );
  strip.appendChild(heading);

  // --- plot -------------------------------------------------------------

  const plot = div('track__plot');

  /*
   * Zodiac bands behind the curve, so a longitude reads as a *place* — "Mars
   * turns in Gemini" — and not only as a number.
   *
   * The same divisions and the same precession offset the ring applies, or the
   * strip and the ring would disagree about where Gemini is while sitting on
   * screen together. A band that straddles the 360° seam is drawn as its two
   * pieces, which is what keeps the constellation scheme, whose boundaries are
   * unequal and wrap, aligned with the ring.
   */
  const divisions = divisionsFor(input.zodiacScheme);
  divisions.forEach((division, index) => {
    const start = normalizeDeg(division.start + input.precession);
    const end = division.end > 360 ? division.end - 360 : division.end;
    const width = normalizeDeg(end - division.start) || 30;

    const pieces =
      start + width <= 360
        ? [[start, width] as const]
        : ([
            [start, 360 - start],
            [0, start + width - 360],
          ] as const);

    for (const [from, extent] of pieces) {
      if (extent <= 0) continue;
      const band = div('track__band');
      band.style.setProperty('--y', String(yOf(from + extent)));
      band.style.setProperty('--span', String(extent / 360));
      band.dataset.parity = String(index % 2);
      // Label the taller piece only, so a split band is not named twice.
      if (extent >= width / 2) {
        band.appendChild(el('span', 'track__band-label', t(`zodiac.${division.id}`)));
      }
      plot.appendChild(band);
    }
  });

  // The curve. One element per sampled step, retrograde runs marked.
  for (const segment of track.segments) {
    const x1 = (segment.from.jd - track.startJd) / span;
    const x2 = (segment.to.jd - track.startJd) / span;
    const y1 = yOf(segment.from.longitude);
    const y2 = yOf(segment.to.longitude);

    const line = div('track__segment');
    if (segment.retrograde) line.classList.add('track__segment--retrograde');
    // The step's own box, not a vector: see the note in layout.css on why a
    // rotated line cannot work in a box whose aspect ratio is unknown here.
    line.style.setProperty('--x', String(Math.min(x1, x2)));
    line.style.setProperty('--w', String(Math.abs(x2 - x1)));
    line.style.setProperty('--y', String(Math.min(y1, y2)));
    line.style.setProperty('--h', String(Math.abs(y2 - y1)));
    line.style.setProperty('--tint', `var(--body-${target})`);
    plot.appendChild(line);
  }

  // Stations: the two moments the motion reverses, which are the whole point.
  for (const station of track.stations) {
    const mark = div('track__station');
    mark.style.setProperty('--x', String((station.jd - track.startJd) / span));
    mark.style.setProperty('--y', String(yOf(station.longitude)));
    mark.dataset.direction = station.toRetrograde ? 'retrograde' : 'direct';
    mark.title = t(
      station.toRetrograde ? 'events.station-retrograde' : 'events.station-direct',
    );
    plot.appendChild(mark);
  }

  // Where the clock is now, tying the strip to the map beneath it.
  const playhead = div('track__playhead');
  const nowX = (julianDate - track.startJd) / span;
  playhead.style.setProperty('--x', String(Math.min(1, Math.max(0, nowX))));
  plot.appendChild(playhead);

  strip.appendChild(plot);

  // --- axes -------------------------------------------------------------

  const axis = div('track__axis');
  axis.appendChild(el('span', undefined, yearOf(track.startJd)));
  axis.appendChild(
    el(
      'span',
      'track__axis-note',
      t('track.window', {
        days: Math.round(span),
        cycle: Math.round(input.cycleDays),
      }),
    ),
  );
  axis.appendChild(el('span', undefined, yearOf(track.endJd)));
  strip.appendChild(axis);

  strip.appendChild(el('p', 'note', t('track.hint')));

  container.appendChild(strip);
}
