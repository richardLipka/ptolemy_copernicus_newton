/**
 * The note that follows the pointer over the machinery.
 *
 * The harness is the one part of the instrument that is pure explanation, and
 * until now it explained itself only in a legend beside the map: a reader had to
 * hold "the diamond is the equant" in their head while looking at a diamond.
 * Pointing at the thing and being told what it is — and what it measures at this
 * date — is the whole of this file.
 *
 * Two decisions worth keeping:
 *
 *  - **The card is rebuilt from the state on every frame it is visible**, so the
 *    numbers run with the clock. Watching the equant's two rates part company as
 *    Mars comes round is the demonstration; a frozen figure would be a caption.
 *  - **The hovered part is found by delegation**, from one listener on the
 *    layer. The harness is pooled and rebuilt continuously — a circle is
 *    seventy-two separate elements — so binding a listener per element would
 *    mean binding thousands and rebinding them as the pools grow.
 */

import type { BodyId } from '@orrery/core/bodies';
import type { HarnessRole } from '../../state/harnessMeasures';
import type { Store } from '../../state/store';
import { el } from '../../ui/dom';
import { harnessNote, type HarnessNote } from './harnessNotes';

export interface HarnessHint {
  /** Re-read the note, or drop it if what it described has gone. */
  refresh(): void;
}

interface Target {
  element: HTMLElement;
  bodyId: BodyId;
  role: HarnessRole;
  markerIndex?: number;
  source?: BodyId;
}

/** How far the card is held off the pointer, px. */
const OFFSET = 16;
/** Breathing room kept between the card and the edge of the stage, px. */
const MARGIN = 8;

/** The harness element under the pointer, if the pointer is over one at all. */
function targetFrom(node: EventTarget | null): Target | null {
  if (!(node instanceof HTMLElement)) return null;

  const element = node.closest<HTMLElement>('[data-role][data-body]');
  if (!element) return null;

  const { role, body, index, source } = element.dataset;
  if (!role || !body) return null;

  return {
    element,
    bodyId: body as BodyId,
    role: role as HarnessRole,
    markerIndex: index === undefined ? undefined : Number(index),
    source: source as BodyId | undefined,
  };
}

const sameTarget = (a: Target | null, b: Target | null): boolean =>
  a !== null &&
  b !== null &&
  a.bodyId === b.bodyId &&
  a.role === b.role &&
  a.markerIndex === b.markerIndex &&
  a.source === b.source;

export function createHarnessHint(
  container: HTMLElement,
  layer: HTMLElement,
  store: Store,
): HarnessHint {
  const card = el('div', 'harness-hint');
  card.setAttribute('role', 'tooltip');
  card.style.display = 'none';

  const title = el('div', 'harness-hint__title');
  const subject = el('div', 'harness-hint__subject');
  const body = el('p', 'harness-hint__body');
  const values = el('div', 'harness-hint__values');
  card.append(title, subject, body, values);
  container.appendChild(card);

  let target: Target | null = null;
  let shown: HarnessNote | null = null;
  let pointer: { x: number; y: number } | null = null;
  // Measured once per content change rather than per pointer move: the card's
  // size only changes when its text does, and reading it back is a layout flush.
  let size = { width: 0, height: 0 };

  function place(): void {
    if (!pointer) return;
    const bounds = container.getBoundingClientRect();

    let x = pointer.x - bounds.left + OFFSET;
    let y = pointer.y - bounds.top + OFFSET;

    // Flip to the other side of the pointer rather than letting the card run
    // off the stage, which on a narrow window is most of the map.
    if (x + size.width > bounds.width - MARGIN) x = x - size.width - 2 * OFFSET;
    if (y + size.height > bounds.height - MARGIN) y = y - size.height - 2 * OFFSET;
    x = Math.max(MARGIN, x);
    y = Math.max(MARGIN, y);

    card.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  }

  function hide(): void {
    if (target === null) return;
    target = null;
    shown = null;
    card.style.display = 'none';
    delete layer.dataset.hover;
  }

  function write(note: HarnessNote): void {
    const unchanged =
      shown !== null &&
      shown.title === note.title &&
      shown.subject === note.subject &&
      shown.body === note.body &&
      shown.values.length === note.values.length &&
      shown.values.every(
        (row, i) => row.label === note.values[i]?.label && row.value === note.values[i]?.value,
      );
    if (unchanged) return;

    const rebuildRows =
      shown === null ||
      shown.values.length !== note.values.length ||
      shown.values.some((row, i) => row.label !== note.values[i]?.label);

    title.textContent = note.title;
    subject.textContent = note.subject;
    body.textContent = note.body;

    if (rebuildRows) {
      values.replaceChildren(
        ...note.values.map((row) => {
          const line = el('div', 'harness-hint__row');
          line.append(
            el('span', 'harness-hint__label', row.label),
            el('span', 'harness-hint__value', row.value),
          );
          return line;
        }),
      );
    } else {
      note.values.forEach((row, i) => {
        const cell = values.children[i]?.lastElementChild;
        if (cell && cell.textContent !== row.value) cell.textContent = row.value;
      });
    }

    shown = note;
    size = { width: card.offsetWidth, height: card.offsetHeight };
  }

  function show(next: Target): void {
    const state = store.get();
    const note = harnessNote(state, next.bodyId, next.role, {
      markerIndex: next.markerIndex,
      source: next.source,
    });
    if (!note) {
      hide();
      return;
    }

    if (!sameTarget(target, next)) shown = null;
    target = next;
    card.style.display = '';
    layer.dataset.hover = next.role;
    write(note);
    place();
  }

  layer.addEventListener('pointerover', (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
    const next = targetFrom(event.target);
    if (next) show(next);
    else hide();
  });

  layer.addEventListener('pointermove', (event: PointerEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
    const next = targetFrom(event.target);
    if (!next) {
      hide();
      return;
    }
    if (sameTarget(target, next)) place();
    else show(next);
  });

  layer.addEventListener('pointerout', (event: PointerEvent) => {
    // Leaving one chord of a circle for the next is not leaving the harness.
    if (targetFrom(event.relatedTarget)) return;
    hide();
  });

  // A drag is about to move the whole map under the pointer, so whatever the
  // card is describing is about to be somewhere else.
  layer.addEventListener('pointerdown', hide);
  container.addEventListener('pointerleave', hide);

  /*
   * The same note by keyboard.
   *
   * Only the markers are focusable — the centre, the foci and the equant, three
   * at most — because they are the landmarks a reader is told to look for and
   * because putting seventy-two chords of a circle in the tab order would be
   * worse than useless. Anchored at the marker rather than at the pointer,
   * since a keyboard user has not got one.
   */
  layer.addEventListener('focusin', (event: FocusEvent) => {
    const next = targetFrom(event.target);
    if (!next) return;
    const box = next.element.getBoundingClientRect();
    pointer = { x: box.left + box.width / 2, y: box.bottom };
    show(next);
  });
  layer.addEventListener('focusout', hide);

  return {
    refresh(): void {
      if (!target) return;

      // What the card describes may have been switched off, deselected or
      // simply pooled away since the pointer landed on it.
      if (!target.element.isConnected || target.element.style.display === 'none') {
        hide();
        return;
      }
      show(target);
    },
  };
}
