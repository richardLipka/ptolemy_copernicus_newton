/**
 * The longitude-against-time strip: what an observer would have written down.
 *
 * Supports optional multi-model ghost tracks so the active model's retrograde
 * loop can be overlaid directly against rival models' tracks over the same
 * synodic cycle.
 */

import type { BodyId } from '@orrery/core/bodies';
import type { EngineId, ModeId } from '@orrery/core/engines/types';
import type { LongitudeTrack } from '@orrery/core/longitudeTrack';
import { dateFromJd } from '@orrery/core/time';
import { normalizeDeg } from '@orrery/core/vec';
import { divisionsFor, type ZodiacScheme } from '@orrery/core/zodiac';
import { bodyName, t } from '../../i18n/i18n';
import { el, note } from '../../ui/dom';

const div = (className: string): HTMLDivElement => {
  const element = document.createElement('div');
  element.className = className;
  return element;
};

const MODEL_OF_ENGINE: Partial<Record<EngineId, ModeId>> = {
  'ptolemaic-epicyclic': 'ptolemy',
  'ptolemaic-almagest': 'ptolemy',
  'ptolemaic-reframe': 'ptolemy',
  copernican: 'copernicus',
  circular: 'copernicus',
  keplerian: 'kepler',
  nbody: 'newton',
};

/** Where a longitude sits in the plot, 0 at the top (360°) to 1 at the bottom. */
const yOf = (longitude: number): number => 1 - longitude / 360;

export interface GhostTrackEntry {
  engineId: EngineId;
  track: LongitudeTrack;
}

export interface TrackStripInput {
  track: LongitudeTrack;
  /** Optional rival models' tracks plotted faintly behind the active curve. */
  ghostTracks?: readonly GhostTrackEntry[];
  target: BodyId;
  observer: BodyId;
  /** Current date, for the playhead. */
  julianDate: number;
  /** One full cycle of the apparent motion, days — the physical quantity. */
  cycleDays: number;
  /** Zodiac scheme, so the axis is labelled the way the ring is. */
  zodiacScheme: ZodiacScheme;
  /** The offset the ring applies to its divisions, degrees. */
  precession: number;
}

/** Format a Julian date as a bare year, which is all an axis end needs. */
const yearOf = (jd: number): string => String(dateFromJd(jd).getUTCFullYear());

export function renderTrackStrip(container: HTMLElement, input: TrackStripInput): void {
  container.replaceChildren();

  const { track, ghostTracks, target, observer, julianDate } = input;
  const span = track.endJd - track.startJd;
  if (!(span > 0)) return;

  const strip = div('track');

  // --- heading ----------------------------------------------------------

  const heading = div('track__heading');
  const titleGroup = div('track__title-group');
  titleGroup.append(
    el('span', 'track__title', t('track.title', { body: bodyName(target) })),
    el('span', 'track__from', t('info.asSeenFrom', { body: bodyName(observer, 'genitive') })),
  );
  heading.appendChild(titleGroup);

  if (ghostTracks && ghostTracks.length > 0) {
    const legend = div('track__legend');
    for (const ghost of ghostTracks) {
      const model = MODEL_OF_ENGINE[ghost.engineId] ?? 'kepler';
      const item = el('span', 'track__legend-item');
      const dot = el('span', 'chip__swatch');
      dot.style.setProperty('--tint', `var(--model-${model})`);
      item.append(dot, el('span', undefined, t(`mode.${model}`)));
      legend.appendChild(item);
    }
    heading.appendChild(legend);
  }
  strip.appendChild(heading);

  // --- plot -------------------------------------------------------------

  const plot = div('track__plot');

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
      if (extent >= width / 2) {
        band.appendChild(el('span', 'track__band-label', t(`zodiac.${division.id}`)));
      }
      plot.appendChild(band);
    }
  });

  // Rival models' curves behind the active track.
  if (ghostTracks) {
    for (const entry of ghostTracks) {
      const model = MODEL_OF_ENGINE[entry.engineId] ?? 'kepler';
      for (const segment of entry.track.segments) {
        const x1 = (segment.from.jd - track.startJd) / span;
        const x2 = (segment.to.jd - track.startJd) / span;
        const y1 = yOf(segment.from.longitude);
        const y2 = yOf(segment.to.longitude);

        const line = div('track__segment track__segment--ghost');
        line.dataset.engine = entry.engineId;
        line.dataset.model = model;
        line.style.setProperty('--x', String(Math.min(x1, x2)));
        line.style.setProperty('--w', String(Math.abs(x2 - x1)));
        line.style.setProperty('--y', String(Math.min(y1, y2)));
        line.style.setProperty('--h', String(Math.abs(y2 - y1)));
        line.style.setProperty('--tint', `var(--model-${model})`);
        plot.appendChild(line);
      }
    }
  }

  // Active model curve.
  for (const segment of track.segments) {
    const x1 = (segment.from.jd - track.startJd) / span;
    const x2 = (segment.to.jd - track.startJd) / span;
    const y1 = yOf(segment.from.longitude);
    const y2 = yOf(segment.to.longitude);

    const line = div('track__segment');
    if (segment.retrograde) line.classList.add('track__segment--retrograde');
    line.style.setProperty('--x', String(Math.min(x1, x2)));
    line.style.setProperty('--w', String(Math.abs(x2 - x1)));
    line.style.setProperty('--y', String(Math.min(y1, y2)));
    line.style.setProperty('--h', String(Math.abs(y2 - y1)));
    line.style.setProperty('--tint', `var(--body-${target})`);
    plot.appendChild(line);
  }

  // Stations: the two moments the motion reverses.
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

  // Playhead for current date.
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

  strip.appendChild(note(t('track.hint')));

  container.appendChild(strip);
}
