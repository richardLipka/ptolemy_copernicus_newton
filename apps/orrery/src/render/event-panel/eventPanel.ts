/**
 * Upcoming events, on-demand event finder, and cross-model date comparison.
 *
 * The comparison table is the app's argument in its most direct form: one
 * event, a date from each model, and the spread between them. The finder at the
 * top lets a student search forward up to 10 years for any conjunction,
 * opposition, or retrograde station and jump directly to it.
 */

import { BODIES, BODY_IDS, type BodyId } from '@orrery/core/bodies';
import { ENGINES } from '@orrery/core/engines/registry';
import type { EngineId, PositionSet } from '@orrery/core/engines/types';
import {
  REFERENCE_ENGINE,
  compareAcrossModels,
  findConjunctions,
  findOppositions,
  findStations,
  scanEvents,
  type AstronomicalEvent,
  type ModelComparison,
} from '@orrery/core/events';
import { MAX_JD, dateFromJd } from '@orrery/core/time';
import { bodyName, formatDate, formatDateTime, formatNumber, t } from '../../i18n/i18n';
import type { Store } from '../../state/store';
import { el, note, select } from '../../ui/dom';

/** Window scanned around the current date, days. */
const WINDOW_DAYS = 400;

/** Progressive search horizons (days) so common events return immediately. */
const SEARCH_HORIZONS: readonly number[] = [400, 1200, 3652];

/** Classical wanderers for event detection (satellites excluded). */
const EVENT_BODIES: readonly BodyId[] = BODY_IDS.filter(
  (id) => id !== 'earth' && BODIES[id].satellite === undefined,
);

type SearchKind = 'conjunction' | 'opposition' | 'station';

/** Persisted finder state across panel rebuilds. */
let searchKind: SearchKind = 'conjunction';
let searchBodyA: BodyId = 'jupiter';
let searchBodyB: BodyId = 'saturn';
let searchOutcome: { event: AstronomicalEvent | null; errorKey: string | null } | null = null;

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
 */
export const EVENT_COMPARISON_ENGINES: readonly EngineId[] = [
  REFERENCE_ENGINE,
  'nbody',
  'keplerian',
  'copernican',
  'ptolemaic-epicyclic',
];

function comparisonEngines(): Map<EngineId, (jd: number) => PositionSet> {
  return new Map<EngineId, (jd: number) => PositionSet>(
    EVENT_COMPARISON_ENGINES.map((id) => [id, (jd: number) => ENGINES[id].positionsAt(jd)]),
  );
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

/** Bounded cache for cross-model event comparisons, shared by badges and clicks. */
const COMPARISON_CACHE_LIMIT = 200;
const comparisonCache = new Map<string, ModelComparison>();
let spreadScanGeneration = 0;

function comparisonKey(event: AstronomicalEvent, observer: BodyId): string {
  return `${observer}|${event.kind}|${event.body}|${event.other ?? ''}|${Math.round(event.jd / 2)}`;
}

function getComparison(event: AstronomicalEvent, observer: BodyId): ModelComparison {
  const key = comparisonKey(event, observer);
  const cached = comparisonCache.get(key);
  if (cached) return cached;

  const computed = compareAcrossModels(event, comparisonEngines(), observer);
  if (comparisonCache.size >= COMPARISON_CACHE_LIMIT) {
    const oldest = comparisonCache.keys().next().value;
    if (oldest !== undefined) comparisonCache.delete(oldest);
  }
  comparisonCache.set(key, computed);
  return computed;
}

function formatSpreadBadge(days: number): string {
  if (days < 0.05) return `Δ <0.1 ${t('events.comparison.days')}`;
  return `Δ ${formatNumber(days, 1)} ${t('events.comparison.days')}`;
}

function scheduleIdle(task: () => void): void {
  const ric = (globalThis as { requestIdleCallback?: (cb: () => void) => number })
    .requestIdleCallback;
  if (typeof ric === 'function') {
    ric(task);
  } else {
    setTimeout(task, 16);
  }
}

function renderComparisonTable(event: AstronomicalEvent, observer: BodyId): HTMLDivElement {
  const comparison = getComparison(event, observer);

  const table = el('div', 'comparison');
  table.appendChild(el('div', 'field__label', t('events.comparison.title')));

  for (const [engineId, jd] of comparison.predictions) {
    const isReference = engineId === REFERENCE_ENGINE;
    const line = el('div', 'comparison__row');
    if (isReference) line.classList.add('comparison__row--reference');

    line.appendChild(
      el(
        'span',
        undefined,
        isReference ? t('events.comparison.actual') : t(`engine.${engineId}`),
      ),
    );
    line.appendChild(el('span', 'readout__value', formatDateTime(dateFromJd(jd))));
    table.appendChild(line);

    if (!isReference && comparison.referenceJd !== null) {
      table.appendChild(
        el('div', 'comparison__offset', formatOffset(jd - comparison.referenceJd)),
      );
    }
  }

  table.appendChild(
    el(
      'div',
      'comparison__spread',
      `${t('events.comparison.spread')}: ${formatNumber(comparison.spreadDays, 1)} ${t('events.comparison.days')}`,
    ),
  );
  table.appendChild(note(t('events.comparison.referenceNote')));
  return table;
}

function searchNextEvent(
  engineId: EngineId,
  observer: BodyId,
  startJd: number,
  kind: SearchKind,
  bodyA: BodyId,
  bodyB: BodyId,
): AstronomicalEvent | null {
  const positionsAt = (jd: number): PositionSet => ENGINES[engineId].positionsAt(jd);
  const stepDays = bodyA === 'moon' || (kind === 'conjunction' && bodyB === 'moon') ? 1 : 2;
  let cursor = startJd + 0.5;

  for (const horizon of SEARCH_HORIZONS) {
    const endJd = Math.min(MAX_JD, startJd + horizon);
    if (endJd <= cursor) break;

    const options = { observer, startJd: cursor, endJd, stepDays };
    let matches: AstronomicalEvent[];
    if (kind === 'conjunction') {
      matches = findConjunctions(positionsAt, bodyA, bodyB, options);
    } else if (kind === 'opposition') {
      matches = findOppositions(positionsAt, bodyA, options);
    } else {
      matches = findStations(positionsAt, bodyA, options);
    }

    if (matches.length > 0) {
      return matches.sort((a, b) => a.jd - b.jd)[0]!;
    }
    cursor = Math.max(cursor, endJd - stepDays);
  }

  return null;
}

export interface EventPanelOptions {
  /**
   * Jump the clock to a clicked event without immediately replacing this panel
   * when the event sits past the rescan threshold.
   */
  onJump?: (jd: number) => void;
}

export function renderEventPanel(
  container: HTMLElement,
  store: Store,
  options: EventPanelOptions = {},
): void {
  const state = store.get();
  const scanGen = ++spreadScanGeneration;
  container.replaceChildren();

  const pane = el('div', 'events-pane');
  const jump = options.onJump ?? ((jd: number) => store.setJulianDate(jd));

  // --- 1. On-demand Event Finder -----------------------------------------

  const finder = el('form', 'event-search');
  finder.appendChild(el('div', 'field__label', t('events.searchTitle')));

  const primaryChoices = EVENT_BODIES.filter(
    (id) => id !== state.observationPoint && (searchKind === 'conjunction' || id !== 'sun'),
  );
  const secondaryChoices = EVENT_BODIES.filter((id) => id !== state.observationPoint);

  if (!primaryChoices.includes(searchBodyA) && primaryChoices[0]) {
    searchBodyA = primaryChoices[0];
  }
  if (!secondaryChoices.includes(searchBodyB) && secondaryChoices[0]) {
    searchBodyB = secondaryChoices.find((id) => id !== searchBodyA) ?? secondaryChoices[0];
  }

  const kindSelect = select<SearchKind>(
    [
      { value: 'conjunction', label: t('events.kind.conjunction') },
      { value: 'opposition', label: t('events.kind.opposition') },
      { value: 'station', label: t('events.kind.station') },
    ],
    searchKind,
    (next) => {
      searchKind = next;
      searchOutcome = null;
      renderEventPanel(container, store, options);
    },
  );
  kindSelect.setAttribute('aria-label', t('events.searchTitle'));

  const bodyASelect = select<BodyId>(
    primaryChoices.map((id) => ({ value: id, label: bodyName(id) })),
    searchBodyA,
    (next) => {
      searchBodyA = next;
      searchOutcome = null;
    },
  );

  const controlsRow = el('div', 'event-search__row');
  controlsRow.append(bodyASelect);

  if (searchKind === 'conjunction') {
    const bodyBSelect = select<BodyId>(
      secondaryChoices.map((id) => ({ value: id, label: bodyName(id) })),
      searchBodyB,
      (next) => {
        searchBodyB = next;
        searchOutcome = null;
      },
    );
    controlsRow.append(bodyBSelect);
  }

  const submitBtn = el('button', 'event-search__submit', t('events.searchNext'));
  submitBtn.type = 'submit';

  finder.append(kindSelect, controlsRow, submitBtn);

  finder.addEventListener('submit', (event) => {
    event.preventDefault();
    if (searchKind === 'conjunction' && searchBodyA === searchBodyB) {
      searchOutcome = { event: null, errorKey: 'events.searchSameBody' };
      renderEventPanel(container, store, options);
      return;
    }

    const found = searchNextEvent(
      state.engineId,
      state.observationPoint,
      state.julianDate,
      searchKind,
      searchBodyA,
      searchBodyB,
    );

    if (!found) {
      searchOutcome = { event: null, errorKey: 'events.searchNone' };
      renderEventPanel(container, store, options);
      return;
    }

    searchOutcome = { event: found, errorKey: null };
    jump(found.jd);
    renderEventPanel(container, store, options);
  });

  if (searchOutcome) {
    const resultBox = el('div', 'event-search__result');
    if (searchOutcome.errorKey) {
      resultBox.appendChild(el('p', 'note note--live', t(searchOutcome.errorKey)));
    } else if (searchOutcome.event) {
      const found = searchOutcome.event;
      resultBox.append(
        el('div', 'event__date', formatDate(dateFromJd(found.jd))),
        el('div', 'event__title', describe(found)),
        renderComparisonTable(found, state.observationPoint),
      );
    }
    finder.appendChild(resultBox);
  }

  pane.appendChild(finder);

  // --- 2. Upcoming events feed -------------------------------------------

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
    pane.appendChild(note(t('events.none'), 'note note--live'));
    container.appendChild(pane);
    return;
  }

  const list = el('div', 'event-list');
  const pendingBadges: { event: AstronomicalEvent; badge: HTMLSpanElement }[] = [];

  for (const event of events) {
    const row = el('div', 'event');

    const head = el('div', 'event__head');
    head.tabIndex = 0;
    head.setAttribute('role', 'button');
    head.setAttribute('aria-expanded', 'false');

    const meta = el('div', 'event__meta');
    meta.appendChild(el('div', 'event__date', formatDate(dateFromJd(event.jd))));
    meta.appendChild(el('div', 'event__title', describe(event)));

    if (event.separation !== undefined) {
      meta.appendChild(
        el(
          'div',
          'event__date',
          `${t('events.separation')} ${formatNumber(event.separation, 2)}°`,
        ),
      );
    }

    const headRight = el('div', 'event__head-right');
    const spreadBadge = el('span', 'event__spread');
    const cached = comparisonCache.get(comparisonKey(event, state.observationPoint));
    if (cached) {
      spreadBadge.textContent = formatSpreadBadge(cached.spreadDays);
    } else {
      spreadBadge.hidden = true;
      pendingBadges.push({ event, badge: spreadBadge });
    }

    const chevron = el('span', 'event__chevron', '▸');
    chevron.setAttribute('aria-hidden', 'true');
    headRight.append(spreadBadge, chevron);
    head.append(meta, headRight);
    row.appendChild(head);

    let expanded: HTMLElement | null = null;
    const toggle = (): void => {
      if (expanded) {
        expanded.remove();
        expanded = null;
        head.setAttribute('aria-expanded', 'false');
        chevron.textContent = '▸';
        return;
      }

      jump(event.jd);
      const table = renderComparisonTable(event, state.observationPoint);
      const latest = comparisonCache.get(comparisonKey(event, state.observationPoint));
      if (latest) {
        spreadBadge.textContent = formatSpreadBadge(latest.spreadDays);
        spreadBadge.hidden = false;
      }
      row.appendChild(table);
      expanded = table;
      head.setAttribute('aria-expanded', 'true');
      chevron.textContent = '▾';
    };

    head.addEventListener('click', toggle);
    head.addEventListener('keydown', (keyboardEvent) => {
      if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
        keyboardEvent.preventDefault();
        toggle();
      }
    });

    list.appendChild(row);
  }

  pane.appendChild(list);
  container.appendChild(pane);

  // Fill cross-model spread badges lazily during idle slices so opening the
  // Events tab never blocks the UI thread.
  if (pendingBadges.length > 0) {
    let cursor = 0;
    const observer = state.observationPoint;
    const step = (): void => {
      if (scanGen !== spreadScanGeneration) return;
      const item = pendingBadges[cursor++];
      if (!item) return;
      if (item.badge.isConnected) {
        const comparison = getComparison(item.event, observer);
        item.badge.textContent = formatSpreadBadge(comparison.spreadDays);
        item.badge.hidden = false;
      }
      if (cursor < pendingBadges.length) scheduleIdle(step);
    };
    scheduleIdle(step);
  }
}
