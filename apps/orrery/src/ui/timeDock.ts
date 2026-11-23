/**
 * Floating bottom-center time transport pill.
 *
 * Keeps playback, date stepping, speed ladder, and calendar jump in one sleek
 * horizontal instrument bar centred under the map — freeing the entire right
 * column for the Selected Body inspector and Events panel.
 */

import { MAX_JD, MIN_JD, dateFromJd, jdFromDate } from '@orrery/core/time';
import { formatNumber, t } from '../i18n/i18n';
import type { Store } from '../state/store';
import { el } from './dom';

export interface TimeDock {
  /** Date field, updated in place as the clock advances. */
  dateInput: HTMLInputElement;
  /** Clock readout, written every frame. */
  clock: HTMLElement;
}

export function renderTimeDock(container: HTMLElement, store: Store): TimeDock {
  const state = store.get();
  container.replaceChildren();

  const pill = el('div', 'time-pill panel');
  pill.setAttribute('role', 'region');
  pill.setAttribute('aria-label', t('time.label'));

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

  // --- transport ---------------------------------------------------------

  const transport = el('div', 'time-pill__group');
  const playPause = el(
    'button',
    'time-pill__play',
    state.playing ? `⏸ ${t('time.pause')}` : `▶ ${t('time.play')}`,
  );
  playPause.type = 'button';
  playPause.addEventListener('click', () => store.togglePlay());

  transport.append(
    iconButton('‹', t('time.stepBack'), () => store.stepDays(-1)),
    playPause,
    iconButton('›', t('time.stepForward'), () => store.stepDays(1)),
  );

  // --- date & live clock -------------------------------------------------

  const chrono = el('div', 'time-pill__group time-pill__chrono');
  const clock = el('span', 'time-pill__clock');

  const dateInput = el('input', 'time-pill__date');
  dateInput.type = 'date';
  dateInput.setAttribute('aria-label', t('time.label'));
  dateInput.valueAsDate = dateFromJd(state.julianDate);
  dateInput.min = dateFromJd(MIN_JD).toISOString().slice(0, 10);
  dateInput.max = dateFromJd(MAX_JD).toISOString().slice(0, 10);
  dateInput.addEventListener('change', () => {
    if (dateInput.valueAsDate) store.setJulianDate(jdFromDate(dateInput.valueAsDate));
  });

  const today = el('button', 'time-pill__today', t('time.today'));
  today.type = 'button';
  today.addEventListener('click', () => store.jumpToDate(new Date()));

  chrono.append(clock, dateInput, today);

  // --- rate ladder -------------------------------------------------------

  const rateGroup = el('div', 'time-pill__group');
  const rate = el(
    'span',
    'time-pill__rate',
    `${formatNumber(state.rateDaysPerSecond, state.rateDaysPerSecond < 1 ? 2 : 0)} ${t('time.rate.unit')}`,
  );

  rateGroup.append(
    iconButton('−', t('time.slower'), () => store.stepRate(-1), !store.canSlowDown),
    rate,
    iconButton('+', t('time.faster'), () => store.stepRate(1), !store.canSpeedUp),
  );

  pill.append(transport, chrono, rateGroup);
  container.appendChild(pill);

  return { dateInput, clock };
}
