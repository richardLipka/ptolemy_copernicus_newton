/** Small DOM helpers. The UI is hand-built, so these carry their weight. */

import { linkify } from '../i18n/wikiLinks';

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * A paragraph of explanatory prose, with the names in it linked.
 *
 * Every note in the app goes through here rather than through `el`, which is
 * what makes the linking uniform: there is one place that decides a name is
 * worth a link, and it is not each of the two dozen call sites. See
 * `i18n/wikiLinks.ts` for what counts as a name and why the dictionaries stay
 * free of markup.
 */
export function note(text: string, className = 'note'): HTMLParagraphElement {
  return linked('p', className, text);
}

/** The same, for prose that is not a paragraph — a list item, a caption. */
export function linked<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string | undefined,
  text: string,
): HTMLElementTagNameMap[K] {
  const node = el(tag, className);
  node.appendChild(linkify(text));
  return node;
}

/** A panel. The heading is optional: the quiet corner ones carry their own. */
export function panel(title?: string): HTMLDivElement {
  const container = el('div', 'panel');
  if (title !== undefined) container.appendChild(el('h2', 'panel__title', title));
  return container;
}

export function field(label: string, control: HTMLElement, hint?: string): HTMLDivElement {
  const wrapper = el('div', 'field');
  wrapper.appendChild(el('label', 'field__label', label));
  wrapper.appendChild(control);
  if (hint) wrapper.appendChild(el('span', 'field__hint', hint));
  return wrapper;
}

export function select<T extends string>(
  options: readonly { value: T; label: string }[],
  value: T,
  onChange: (value: T) => void,
): HTMLSelectElement {
  const node = el('select');
  for (const option of options) {
    const item = el('option');
    item.value = option.value;
    item.textContent = option.label;
    node.appendChild(item);
  }
  node.value = value;
  node.addEventListener('change', () => onChange(node.value as T));
  return node;
}

export function readout(label: string, value: string): HTMLDivElement {
  const row = el('div', 'readout');
  row.appendChild(el('span', 'readout__label', label));
  row.appendChild(el('span', 'readout__value', value));
  return row;
}

export function toggleButton(
  label: string,
  pressed: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const button = el('button', undefined, label);
  button.type = 'button';
  button.setAttribute('aria-pressed', String(pressed));
  button.addEventListener('click', onClick);
  return button;
}

/**
 * Roving-tabindex keyboard navigation fallback for `focusgroup` toolbars and
 * tablists. Installed only when native `focusGroup` is absent.
 */
export function wireRovingFocus(
  container: HTMLElement,
  itemSelector: string,
  options: { activateOnFocus?: boolean } = {},
): void {
  if (typeof HTMLElement === 'undefined' || 'focusGroup' in HTMLElement.prototype) return;

  const items = (): HTMLElement[] =>
    Array.from(container.querySelectorAll<HTMLElement>(itemSelector)).filter(
      (node) => !node.hidden && !(node as HTMLButtonElement).disabled,
    );

  const list = items();
  if (list.length === 0) return;

  const initial =
    list.find((item) => item.getAttribute('aria-selected') === 'true') ??
    list.find((item) => item.hasAttribute('focusgroupstart')) ??
    list[0]!;
  list.forEach((item) => {
    item.tabIndex = item === initial ? 0 : -1;
  });

  container.addEventListener('focusin', (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>(itemSelector);
    if (!target || !container.contains(target)) return;
    for (const item of items()) item.tabIndex = item === target ? 0 : -1;
  });

  container.addEventListener('keydown', (event) => {
    const currentList = items();
    if (currentList.length < 2) return;
    const active = (document.activeElement as Element | null)?.closest<HTMLElement>(itemSelector);
    const index = active ? currentList.indexOf(active) : -1;
    if (index === -1) return;

    const rtl = getComputedStyle(container).direction === 'rtl';
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') {
      nextIndex = (index + (rtl ? -1 : 1) + currentList.length) % currentList.length;
    } else if (event.key === 'ArrowLeft') {
      nextIndex = (index + (rtl ? 1 : -1) + currentList.length) % currentList.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = currentList.length - 1;
    }
    if (nextIndex === null) return;

    event.preventDefault();
    const target = currentList[nextIndex]!;
    for (const item of currentList) item.tabIndex = item === target ? 0 : -1;
    target.focus();
    if (options.activateOnFocus) target.click();
  });
}
