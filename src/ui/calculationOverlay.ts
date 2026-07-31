/**
 * The calculation and demonstrations overlay.
 *
 * Opened on demand rather than docked, because it is the one part of the app
 * that wants to be read rather than driven: four columns of working, side by
 * side, are wider than any dock and are not something you glance at while the
 * clock runs.
 *
 * It is rebuilt only while open, and on the same wall-clock budget as the other
 * panels — four models' working means evaluating four engines, which has no
 * business on the animation path.
 */

import {
  calculationsFor,
  type CalculationLine,
  type ModelCalculation,
} from '../core/calculation';
import { DEMONSTRATIONS } from '../core/demonstrations';
import { dateFromJd } from '../core/time';
import { bodyName, formatDate, formatNumber, t } from '../i18n/i18n';
import type { Store } from '../state/store';
import { el } from './dom';

/**
 * Render a magnitude in the reader's locale.
 *
 * Czech writes 141,500 where English writes 141.500, and this panel is nothing
 * but numbers — getting it wrong here would be more conspicuous than anywhere
 * else in the app.
 */
function formatValue(line: CalculationLine): string {
  if (line.value === null) return '—';

  switch (line.unit) {
    case 'degrees':
      return `${formatNumber(line.value, 3)}°`;
    case 'signedDegrees':
      // An explicit plus, because a correction of +24° and one of −24° are the
      // difference between a model that works and one that does not.
      return `${line.value >= 0 ? '+' : '−'}${formatNumber(Math.abs(line.value), 3)}°`;
    case 'au':
      return `${formatNumber(line.value, 5)} ${t('info.unit.au')}`;
    case 'ratio':
      return formatNumber(line.value, 4);
    case 'days':
      return `${formatNumber(line.value, 2)} d`;
    case 'count':
      return formatNumber(line.value, 0);
    default:
      return '—';
  }
}

function renderCalculationColumn(calculation: ModelCalculation): HTMLElement {
  const column = el('div', 'working');
  column.appendChild(el('h3', 'working__title', t(`engine.${calculation.engineId}`)));

  const table = el('div', 'working__lines');
  for (const line of calculation.lines) {
    const row = el('div', 'working__line');
    if (line.isResult) row.classList.add('working__line--result');

    const label = el('div', 'working__label', t(line.labelKey));
    if (line.formula) {
      // Notation rather than prose, so it is not localised — see CalculationLine.
      label.appendChild(el('span', 'working__formula', line.formula));
    }
    row.append(label, el('div', 'working__value', formatValue(line)));
    table.appendChild(row);
  }
  column.appendChild(table);

  // Cost figures are counts, so they are localised the same way as everything
  // else on the panel rather than left as bare JavaScript numbers.
  const costValues = Object.fromEntries(
    Object.entries(calculation.costValues ?? {}).map(([key, value]) => [
      key,
      formatNumber(value, 0),
    ]),
  );
  column.appendChild(el('p', 'working__cost', t(calculation.costKey, costValues)));
  return column;
}

export function renderCalculationOverlay(container: HTMLElement, store: Store): void {
  const state = store.get();
  container.replaceChildren();

  if (!state.showCalculation) {
    container.hidden = true;
    return;
  }
  container.hidden = false;

  const sheet = el('div', 'overlay__sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', t('calc.title'));

  // --- header -----------------------------------------------------------

  const header = el('div', 'overlay__header');
  header.append(el('h2', 'overlay__title', t('calc.title')));

  const close = el('button', 'overlay__close', '×');
  close.type = 'button';
  close.setAttribute('aria-label', t('calc.close'));
  close.addEventListener('click', () => store.setCalculationOpen(false));
  header.appendChild(close);
  sheet.appendChild(header);

  sheet.appendChild(el('p', 'note', t('calc.intro')));

  // --- demonstrations ---------------------------------------------------

  sheet.appendChild(el('h3', 'overlay__section', t('calc.demonstrations')));
  sheet.appendChild(el('p', 'note', t('calc.demonstrations.intro')));

  const list = el('div', 'demos');
  for (const demonstration of DEMONSTRATIONS) {
    const card = el('button', 'demo');
    card.type = 'button';
    card.append(
      el('span', 'demo__date', formatDate(dateFromJd(demonstration.jd))),
      el('span', 'demo__title', t(`demo.${demonstration.id}`)),
      el('span', 'demo__note', t(`demo.${demonstration.id}.note`)),
    );
    card.addEventListener('click', () => store.applyDemonstration(demonstration));
    list.appendChild(card);
  }
  sheet.appendChild(list);

  // --- the working ------------------------------------------------------

  sheet.appendChild(el('h3', 'overlay__section', t('calc.working')));

  if (!state.selectedBody || state.selectedBody === state.observationPoint) {
    sheet.appendChild(el('p', 'note', t('calc.selectBody')));
  } else {
    sheet.appendChild(
      el(
        'p',
        'note',
        t('calc.working.intro', {
          body: bodyName(state.selectedBody, 'genitive'),
          date: formatDate(dateFromJd(state.julianDate)),
        }),
      ),
    );

    const columns = el('div', 'workings');
    for (const calculation of calculationsFor(
      state.julianDate,
      state.selectedBody,
      state.observationPoint,
    )) {
      columns.appendChild(renderCalculationColumn(calculation));
    }
    sheet.appendChild(columns);
    sheet.appendChild(el('p', 'note', t('calc.working.moral')));
  }

  container.appendChild(sheet);

  // Clicking the backdrop dismisses; clicking the sheet must not.
  container.addEventListener('click', (event) => {
    if (event.target === container) store.setCalculationOpen(false);
  });

  close.focus();
}
