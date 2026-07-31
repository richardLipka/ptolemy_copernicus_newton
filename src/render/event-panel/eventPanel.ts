/**
 * Upcoming events, and what each model says about them.
 *
 * The comparison table is the app's argument in its most direct form: one
 * event, three dates, and the spread between them. A Mars opposition that
 * Newton and Ptolemy place a fortnight apart says more about the two systems
 * than any amount of prose.
 *
 * Scanning is deliberately kept off the animation path — it runs when the
 * date or model changes, not per frame, because each scan evaluates the engine
 * a few hundred times.
 */

import { BODY_IDS, type BodyId } from '../../core/bodies';
import type { EngineId, PositionSet } from '../../core/engines/types';
import {
  REFERENCE_ENGINE,
  compareAcrossModels,
  scanEvents,
  type AstronomicalEvent,
} from '../../core/events';
import { dateFromJd } from '../../core/time';
import { bodyName, formatDate, formatDateTime, formatNumber, t } from '../../i18n/i18n';
import { ENGINES, type Store } from '../../state/store';
import { el, panel } from '../../ui/dom';

/** Window scanned around the current date, days. */
const WINDOW_DAYS = 400;

/** Bodies worth reporting events for — the classical wanderers. */
const EVENT_BODIES: readonly BodyId[] = BODY_IDS.filter((id) => id !== 'earth');

function describe(event: AstronomicalEvent): string {
  switch (event.kind) {
    case 'conjunction':
      return t('events.conjunctionOf', {
        a: bodyName(event.body, 'genitive'),
        b: bodyName(event.other!, 'genitive'),
      });
    case 'opposition':
      return t('events.oppositionOf', { body: bodyName(event.body, 'genitive') });
    default:
      return `${t(`events.${event.kind}`)} — ${bodyName(event.body, 'genitive')}`;
  }
}

/**
 * Engines to put side by side: the modern reference first, then one per
 * historical model.
 *
 * The reference leads because everything below it is read as a departure from
 * it. It is the same ephemeris the accuracy tests measure against — see
 * CLAUDE.md §12.7 for what it is and is not good for.
 */
function comparisonEngines(): Map<EngineId, (jd: number) => PositionSet> {
  return new Map<EngineId, (jd: number) => PositionSet>([
    [REFERENCE_ENGINE, (jd) => ENGINES[REFERENCE_ENGINE].positionsAt(jd)],
    ['nbody', (jd) => ENGINES.nbody.positionsAt(jd)],
    ['keplerian', (jd) => ENGINES.keplerian.positionsAt(jd)],
    ['circular', (jd) => ENGINES.circular.positionsAt(jd)],
    ['ptolemaic-epicyclic', (jd) => ENGINES['ptolemaic-epicyclic'].positionsAt(jd)],
  ]);
}

/** A model's offset from the reference, as a signed count of days. */
function formatOffset(days: number): string {
  if (Math.abs(days) < 1 / 48) return t('events.comparison.onTime');
  const sign = days > 0 ? '+' : '−';
  const size = Math.abs(days);
  return size < 1
    ? `${sign}${formatNumber(size * 24, 1)} ${t('events.comparison.hours')}`
    : `${sign}${formatNumber(size, 1)} ${t('events.comparison.days')}`;
}

export function renderEventPanel(container: HTMLElement, store: Store): void {
  const state = store.get();
  container.replaceChildren();

  const card = panel(t('events.title'));

  const events = scanEvents(
    (jd) => ENGINES[state.engineId].positionsAt(jd),
    EVENT_BODIES,
    {
      observer: state.observationPoint,
      startJd: state.julianDate,
      endJd: state.julianDate + WINDOW_DAYS,
      stepDays: 2,
    },
  ).slice(0, 12);

  if (events.length === 0) {
    card.appendChild(el('p', 'note', t('events.none')));
    container.appendChild(card);
    return;
  }

  for (const event of events) {
    const row = el('div', 'event');
    row.appendChild(el('div', 'event__date', formatDate(dateFromJd(event.jd))));
    row.appendChild(el('div', 'event__title', describe(event)));

    if (event.separation !== undefined) {
      row.appendChild(
        el(
          'div',
          'event__date',
          `${t('events.separation')} ${formatNumber(event.separation, 2)}°`,
        ),
      );
    }

    // Expand on click rather than computing every comparison up front: each
    // one re-scans three engines around the date.
    let expanded: HTMLElement | null = null;
    row.addEventListener('click', () => {
      store.setJulianDate(event.jd);

      if (expanded) {
        expanded.remove();
        expanded = null;
        return;
      }

      const comparison = compareAcrossModels(
        event,
        comparisonEngines(),
        state.observationPoint,
      );

      const table = el('div', 'comparison');
      table.appendChild(el('div', 'field__label', t('events.comparison.title')));

      for (const [engineId, jd] of comparison.predictions) {
        const isReference = engineId === REFERENCE_ENGINE;
        const line = el('div', 'comparison__row');
        if (isReference) line.classList.add('comparison__row--reference');

        line.appendChild(
          el('span', undefined, isReference ? t('events.comparison.actual') : t(`engine.${engineId}`)),
        );

        // Date and time for everything, since the models are compared to the
        // hour. The reading is UT; see the note under the table.
        const when = el('span', 'readout__value', formatDateTime(dateFromJd(jd)));
        line.appendChild(when);
        table.appendChild(line);

        // How far this model missed by, which is the number worth reading.
        if (!isReference && comparison.referenceJd !== null) {
          const offset = el(
            'div',
            'comparison__offset',
            formatOffset(jd - comparison.referenceJd),
          );
          table.appendChild(offset);
        }
      }

      table.appendChild(
        el(
          'div',
          'comparison__spread',
          `${t('events.comparison.spread')}: ${formatNumber(comparison.spreadDays, 1)} ${t('events.comparison.days')}`,
        ),
      );

      // The reference is an approximation too, and saying so is the difference
      // between a teaching tool and a false authority.
      table.appendChild(el('p', 'note', t('events.comparison.referenceNote')));

      row.appendChild(table);
      expanded = table;
    });

    card.appendChild(row);
  }

  container.appendChild(card);
}
