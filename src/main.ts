/**
 * Wiring.
 *
 * The map is full-bleed and the controls float over it in docks. Two update
 * paths, deliberately separated by cost: the instrument updates in place every
 * animation frame, while the panels rebuild only when something they show
 * actually changes. Event scanning evaluates the engine a few hundred times, so
 * it does not belong on the animation path.
 */

import './render/theme/tokens.css';
import './render/theme/theme-orrery.css';
import './render/theme/theme-atelier.css';
import './render/theme/theme-nocturne.css';
import './render/theme/theme-lcars.css';
import './render/theme/shell.css';
import './render/theme/layout.css';

import { createOrrery } from './render/orrery/orrery';
import { renderEventPanel } from './render/event-panel/eventPanel';
import { renderInfoPanel } from './render/info-panel/infoPanel';
import { applyTheme } from './render/theme/themes';
import { renderControls } from './ui/controls';
import { renderTimeDock } from './ui/timeDock';
import { renderTopBar } from './ui/topBar';
import { dateFromJd } from './core/time';
import { formatDateTime, setLocale, t } from './i18n/i18n';
import { store } from './state/store';

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('Missing #app');

setLocale(store.get().locale);
applyTheme(store.get().theme);
document.title = t('app.title');

// --- structure -----------------------------------------------------------

const stage = document.createElement('div');
stage.className = 'stage';

/**
 * The region the instrument is measured against.
 *
 * Inset by the dock widths, so the map centres in the gap the user can actually
 * see and the zodiac ring's labels stay clear of the floating panels — even
 * though the drawing itself may pass beneath them.
 */
const field = document.createElement('div');
field.className = 'stage__field';

const dockLeft = document.createElement('div');
dockLeft.className = 'dock dock--left';

const dockTopRight = document.createElement('div');
dockTopRight.className = 'dock dock--top-right';

const dockRight = document.createElement('div');
dockRight.className = 'dock dock--right';

const dockBottomRight = document.createElement('div');
dockBottomRight.className = 'dock dock--bottom-right';

/** Wrapper the narrow-viewport rules turn into a stacked column. */
const dockStack = document.createElement('div');
dockStack.className = 'dock-stack';
dockStack.append(dockTopRight, dockRight, dockBottomRight, dockLeft);

root.append(field, dockStack);

const masthead = document.createElement('header');
masthead.className = 'masthead panel';
dockLeft.appendChild(masthead);

const controlsHost = document.createElement('div');
controlsHost.style.display = 'contents';
dockLeft.appendChild(controlsHost);

const infoHost = document.createElement('div');
infoHost.style.display = 'contents';
const eventsHost = document.createElement('div');
eventsHost.style.display = 'contents';
dockRight.append(infoHost, eventsHost);

const orrery = createOrrery(field, store);

/** Handed back by the time dock so the clock can update without a rebuild. */
let dateInput: HTMLInputElement | null = null;
let clockReadout: HTMLElement | null = null;

function renderMasthead(): void {
  masthead.replaceChildren();
  const title = document.createElement('h1');
  title.className = 'masthead__title';
  title.textContent = t('app.title');
  const subtitle = document.createElement('p');
  subtitle.className = 'masthead__subtitle';
  subtitle.textContent = t('app.subtitle');
  masthead.append(title, subtitle);
}

// --- update budgets ------------------------------------------------------

/**
 * Rebuild budgets, in wall-clock milliseconds.
 *
 * Throttling against simulated time does not work: the rate control makes
 * simulated days pass arbitrarily fast, so a "once per simulated day" budget
 * becomes once per frame at 400 days/s. Real elapsed time is the only measure
 * that holds however fast the clock is spun.
 */
const INFO_BUDGET_MS = 200;
const EVENT_BUDGET_MS = 600;

/** How far the date may drift before the event window is rescanned, days. */
const EVENT_RESCAN_DAYS = 25;

/**
 * What the interactive panels depend on — deliberately *not* the date.
 *
 * These hold the only interactive elements in the app, and replacing a button
 * mid-gesture swallows the click meant for it. Nothing here may vary with time,
 * or the transport controls would be torn down under the pointer while the clock
 * ran, which is exactly how the stop button once came to appear broken.
 */
function controlsSignature(): string {
  const state = store.get();
  return [
    state.mode,
    state.engineId,
    state.ghostEngineId,
    state.frameOrigin,
    state.observationPoint,
    state.zodiacScheme,
    state.sphereCentre,
    state.scaleMode,
    state.showOrbits,
    state.showSightLines,
    state.showStarFigures,
    state.showConstruction,
    state.selectedBody,
    state.locale,
    state.theme,
    state.playing,
    state.rateDaysPerSecond,
  ].join('|');
}

/** What the read-only panels depend on, excluding the date. */
function contextSignature(): string {
  const state = store.get();
  return [
    state.engineId,
    state.ghostEngineId,
    state.frameOrigin,
    state.observationPoint,
    state.zodiacScheme,
    state.scaleMode,
    state.locale,
    state.theme,
  ].join('|');
}

let lastControls = '';
let lastContext = '';
let lastRing = '';
let lastSelected: string | null = null;

let lastInfoAt = 0;
let lastEventAt = 0;
let lastEventScanJd = Number.NaN;

function render(): void {
  const state = store.get();
  const now = performance.now();
  const context = contextSignature();
  const contextChanged = context !== lastContext;
  lastContext = context;

  orrery.update();

  const reading = formatDateTime(dateFromJd(state.julianDate));
  if (clockReadout && clockReadout.textContent !== reading) {
    clockReadout.textContent = reading;
  }

  // Updated in place rather than rebuilt, so typing into it is not interrupted.
  if (dateInput && document.activeElement !== dateInput) {
    const value = dateFromJd(state.julianDate).toISOString().slice(0, 10);
    if (dateInput.value !== value) dateInput.value = value;
  }

  const ring = `${state.zodiacScheme}|${state.locale}|${Math.round(state.julianDate / 3652.5)}`;
  if (ring !== lastRing) {
    lastRing = ring;
    orrery.rebuildRing();
  }

  const controls = controlsSignature();
  if (controls !== lastControls) {
    lastControls = controls;
    renderMasthead();
    renderTopBar(dockTopRight, store);
    renderControls(controlsHost, store);
    const dock = renderTimeDock(dockBottomRight, store);
    dateInput = dock.dateInput;
    clockReadout = dock.clock;
    clockReadout.textContent = reading;
    document.title = t('app.title');
  }

  if (contextChanged || state.selectedBody !== lastSelected || now - lastInfoAt > INFO_BUDGET_MS) {
    lastInfoAt = now;
    lastSelected = state.selectedBody;
    renderInfoPanel(infoHost, store);
  }

  // Event scanning evaluates the engine several hundred times, so it is driven
  // by how far the date has actually moved rather than by every change to it.
  const drifted =
    Number.isNaN(lastEventScanJd) ||
    Math.abs(state.julianDate - lastEventScanJd) > EVENT_RESCAN_DAYS;
  if ((contextChanged || drifted) && now - lastEventAt > EVENT_BUDGET_MS) {
    lastEventAt = now;
    lastEventScanJd = state.julianDate;
    renderEventPanel(eventsHost, store);
  }
}

// --- zoom ----------------------------------------------------------------

/**
 * How sharply the wheel bites. Applied to an exponential, so a notch multiplies
 * rather than adds and zooming feels the same at every magnification.
 */
const ZOOM_SENSITIVITY = 0.0016;

/** Rough pixel equivalents, for wheels that report lines or pages. */
const DELTA_TO_PIXELS = [1, 16, 400];

/**
 * Wheel zoom, listened for on the whole app rather than the instrument.
 *
 * The instrument's box is smaller than the area its drawing covers once
 * magnified, so binding to it would leave dead zones. Events originating inside
 * a dock are left alone, or the panels could not be scrolled.
 */
root.addEventListener(
  'wheel',
  (event: WheelEvent) => {
    if ((event.target as Element | null)?.closest('.dock')) return;
    event.preventDefault();
    const pixels = event.deltaY * (DELTA_TO_PIXELS[event.deltaMode] ?? 1);
    store.zoomBy(Math.exp(-pixels * ZOOM_SENSITIVITY));
  },
  { passive: false },
);

/** Double-click clears the magnification, since the wheel offers no way back. */
root.addEventListener('dblclick', (event: MouseEvent) => {
  if ((event.target as Element | null)?.closest('.dock')) return;
  store.resetZoom();
});

store.subscribe(render);

/**
 * Longest real interval a single frame may represent, seconds.
 *
 * Browsers suspend animation frames in a hidden tab, so the first frame after
 * one is revealed reports the entire time it spent hidden. Left unclamped, that
 * whole interval is multiplied by the time rate: a minute in another tab at 400
 * days a second would jump the clock by sixty-five years and, worse, do it in
 * one step the n-body integrator would have to swallow whole.
 *
 * Clamping means simulated time pauses while the tab is away rather than
 * catching up, which is also the more useful behaviour.
 */
const MAX_FRAME_SECONDS = 0.1;

let previousTimestamp = performance.now();
function frame(timestamp: number): void {
  const elapsedSeconds = Math.min(
    (timestamp - previousTimestamp) / 1000,
    MAX_FRAME_SECONDS,
  );
  previousTimestamp = timestamp;
  store.tick(elapsedSeconds);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

render();
