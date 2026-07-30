/**
 * Time and simulation controls, bottom right.
 *
 * The clock reading is written straight into the DOM by the render loop rather
 * than rebuilt here, and the date field is returned for the same reason: this
 * panel holds the only controls the user reaches for *while* the simulation
 * runs, so it must not be torn down underneath them.
 */

import { MAX_JD, MIN_JD, dateFromJd, jdFromDate } from '../core/time';
import { formatNumber, t } from '../i18n/i18n';
import type { Store } from '../state/store';
import { el, panel } from './dom';

export interface TimeDock {
  /** Date field, updated in place as the clock advances. */
  dateInput: HTMLInputElement;
  /** Clock readout, written every frame. */
  clock: HTMLElement;
}

export function renderTimeDock(container: HTMLElement, store: Store): TimeDock {
  const state = store.get();
  container.replaceChildren();

  const card = panel(t('time.label'));

  const clock = el('div', 'clock');
  card.appendChild(clock);

  // --- transport ---------------------------------------------------------

  const transport = el('div', 'button-row');

  const iconButton = (
    label: string,
    title: string,
    onClick: () => void,
    disabled = false,
  ): HTMLButtonElement => {
    const button = el('button', 'icon-button', label);
    button.type = 'button';
    button.title = title;
    button.setAttribute('aria-label', title);
    button.disabled = disabled;
    button.addEventListener('click', onClick);
    return button;
  };

  transport.append(
    iconButton('‹', t('time.stepBack'), () => store.stepDays(-1)),
    (() => {
      const playPause = el(
        'button',
        undefined,
        state.playing ? t('time.pause') : t('time.play'),
      );
      playPause.type = 'button';
      playPause.addEventListener('click', () => store.togglePlay());
      return playPause;
    })(),
    iconButton('›', t('time.stepForward'), () => store.stepDays(1)),
  );
  card.appendChild(transport);

  // --- rate --------------------------------------------------------------
  //
  // Stepping a geometric ladder rather than typing a number: the useful range
  // spans a factor of 1600, and the buttons make the extremes reachable without
  // making the middle fiddly.

  const rateRow = el('div', 'button-row');
  rateRow.append(
    iconButton(
      '−',
      t('time.slower'),
      () => store.stepRate(-1),
      !store.canSlowDown,
    ),
    (() => {
      const readout = el(
        'div',
        'rate-readout',
        `${formatNumber(state.rateDaysPerSecond, state.rateDaysPerSecond < 1 ? 2 : 0)} ${t('time.rate.unit')}`,
      );
      return readout;
    })(),
    iconButton('+', t('time.faster'), () => store.stepRate(1), !store.canSpeedUp),
  );
  card.appendChild(rateRow);

  // --- jump --------------------------------------------------------------

  const dateInput = el('input');
  dateInput.type = 'date';
  dateInput.valueAsDate = dateFromJd(state.julianDate);
  dateInput.min = dateFromJd(MIN_JD).toISOString().slice(0, 10);
  dateInput.max = dateFromJd(MAX_JD).toISOString().slice(0, 10);
  dateInput.addEventListener('change', () => {
    if (dateInput.valueAsDate) store.setJulianDate(jdFromDate(dateInput.valueAsDate));
  });

  const jumpRow = el('div', 'button-row');
  jumpRow.style.marginTop = '0.4rem';
  const today = el('button', undefined, t('time.today'));
  today.type = 'button';
  today.addEventListener('click', () => store.jumpToDate(new Date()));
  jumpRow.append(dateInput, today);
  card.appendChild(jumpRow);

  container.appendChild(card);

  return { dateInput, clock };
}
