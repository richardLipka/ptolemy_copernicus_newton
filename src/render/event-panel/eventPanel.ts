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
  compareAcrossModels,
  scanEvents,
  type AstronomicalEvent,
} from '../../core/events';
import { dateFromJd } from '../../core/time';
import { bodyName, formatDate, formatNumber, t } from '../../i18n/i18n';
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

/** Engines to put side by side: one per historical model, plus Newton. */
function comparisonEngines(): Map<EngineId, (jd: number) => PositionSet> {
  return new Map<EngineId, (jd: number) => PositionSet>([
    ['nbody', (jd) => ENGINES.nbody.positionsAt(jd)],
    ['circular', (jd) => ENGINES.circular.positionsAt(jd)],
    ['ptolemaic-epicyclic', (jd) => ENGINES['ptolemaic-epicyclic'].positionsAt(jd)],
  ]);
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
        const line = el('div', 'comparison__row');
        line.appendChild(el('span', undefined, t(`engine.${engineId}`)));
        line.appendChild(el('span', 'readout__value', formatDate(dateFromJd(jd))));
        table.appendChild(line);
      }

      table.appendChild(
        el(
          'div',
          'comparison__spread',
          `${t('events.comparison.spread')}: ${formatNumber(comparison.spreadDays, 1)} ${t('events.comparison.days')}`,
        ),
      );

      row.appendChild(table);
      expanded = table;
    });

    card.appendChild(row);
  }

  container.appendChild(card);
}
