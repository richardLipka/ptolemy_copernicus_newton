/**
 * The PNG/SVG pair that appears wherever something can be saved as an image.
 *
 * `buildSvg` is a getter rather than a value for the same reason the filename
 * is: the panels that use this are rebuilt only when their own controls
 * change, not every time the clock ticks, so the SVG has to be regenerated
 * *at the moment of the click* or it would go on quoting a date the map had
 * already moved past.
 */

import { downloadSvgText, downloadSvgTextAsPng, buildExportFilename } from '../render/export/svgDocument';
import { t } from '../i18n/i18n';
import { el } from './dom';

export function exportButtonRow(
  buildSvg: (widthPx: number, heightPx: number) => string | null,
  filenameParts: () => readonly (string | null | undefined)[],
  pixelSize: () => { width: number; height: number },
): HTMLDivElement {
  const wrapper = el('div', 'export');
  const row = el('div', 'button-row');
  // `note--live`, not a plain `note`: this is an error report, not explanatory
  // prose, and must stay visible even with the notes toggle switched off.
  const status = el('p', 'note note--live');
  status.hidden = true;

  const run = (format: 'svg' | 'png', button: HTMLButtonElement): void => {
    status.hidden = true;
    const { width, height } = pixelSize();
    const svg = buildSvg(width, height);
    if (!svg) return;

    const filename = buildExportFilename(filenameParts(), format);

    if (format === 'svg') {
      downloadSvgText(svg, filename);
      return;
    }

    button.disabled = true;
    downloadSvgTextAsPng(svg, width, height, filename)
      .catch(() => {
        status.textContent = t('export.failed');
        status.hidden = false;
      })
      .finally(() => {
        button.disabled = false;
      });
  };

  for (const format of ['svg', 'png'] as const) {
    const button = el('button', undefined, t(`export.${format}`));
    button.type = 'button';
    button.addEventListener('click', () => run(format, button));
    row.appendChild(button);
  }

  wrapper.append(row, status);
  return wrapper;
}
