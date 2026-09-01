/**
 * Small, shared plumbing for the map and phase exporters: text escaping,
 * filenames, theme colours, and turning a finished SVG string into a file.
 *
 * There is no DOM snapshotting anywhere in this app's export path, and that
 * was not the first design. Wrapping a clone of the live instrument in an SVG
 * `<foreignObject>` is the standard trick for turning arbitrary HTML into an
 * image with no dependency — it produces a perfectly valid, perfectly viewable
 * SVG file — but it cannot be turned into a PNG. The instant a `foreignObject`
 * is involved, Chromium refuses to read pixels back out of any canvas it has
 * touched: `canvas.toBlob()` throws `SecurityError: Tainted canvases may not
 * be exported`, regardless of origin, with nothing external referenced and
 * nothing to fix by escaping more carefully. That is documented behaviour —
 * other DOM-to-image tools carry the same restriction — not a defect in this
 * app's markup, and there is no supported way around it from inside the page.
 *
 * So both exporters build **real SVG shapes** instead: circles, lines and text
 * that never pass through HTML at all. `mapSvg.ts` and `phaseSvg.ts` are the
 * two places that decide what those shapes are; this file only turns the
 * finished string into a picture.
 */

/** Rasters are exported at this many pixels per CSS pixel, for print-quality output. */
export const PNG_EXPORT_SCALE = 2;

/**
 * The handful of characters that are not allowed to appear literally inside
 * XML text or an XML attribute value. `t()` strings are static and audited,
 * but a translator adding a stray `&` — the app's own dictionary already has
 * one, in "Calculation & demonstrations" — should not be able to hand this
 * function a document it cannot parse.
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The resolved value of a theme custom property, e.g. `resolveThemeColor('--brass-dark')`. */
export function resolveThemeColor(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * A safe, readable chunk of a filename.
 *
 * Lower-cased and hyphenated rather than escaped, so the result reads as a
 * filename on every platform including the ones that reject characters like
 * `:` or `°` outright — a Windows save dialog would otherwise silently mangle
 * a date or a degree sign into something else.
 */
export function sanitizeFilenamePart(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Join the given parts into `name.ext`, dropping anything that sanitised to nothing. */
export function buildExportFilename(
  parts: readonly (string | null | undefined)[],
  extension: 'svg' | 'png',
): string {
  const clean = parts
    .filter((part): part is string => Boolean(part))
    .map(sanitizeFilenamePart)
    .filter((part) => part.length > 0);
  return `${clean.join('-')}.${extension}`;
}

/** Wrap a body of already-built SVG elements into one complete document. */
export function svgDocument(
  width: number,
  height: number,
  background: string,
  body: string,
): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" ` +
    `viewBox="0 0 ${width} ${height}" font-family="Georgia, 'Times New Roman', serif">` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(background)}"/>` +
    body +
    `</svg>`
  );
}

/** Save a blob to the reader's own machine, as a real file. */
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Freed on the next tick rather than immediately: revoking synchronously
  // has been enough, in some browsers, to invalidate the URL before the
  // download it triggered had actually started.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadSvgText(svgText: string, filename: string): void {
  downloadBlob(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }), filename);
}

/**
 * The SVG, rasterised through a canvas at `PNG_EXPORT_SCALE` pixels per CSS
 * pixel — sharp enough to paste into a slide or print, not so large that a
 * single image runs to tens of megabytes. Safe against the tainting problem
 * described above only because nothing this app builds ever contains a
 * `foreignObject`.
 */
async function svgTextToPngBlob(svgText: string, width: number, height: number): Promise<Blob> {
  const svgUrl = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));

  try {
    const image = new Image();
    image.src = svgUrl;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('the SVG failed to rasterise'));
    });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * PNG_EXPORT_SCALE);
    canvas.height = Math.round(height * PNG_EXPORT_SCALE);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas 2D context unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('canvas produced no image data');
    return blob;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

export async function downloadSvgTextAsPng(
  svgText: string,
  width: number,
  height: number,
  filename: string,
): Promise<void> {
  const blob = await svgTextToPngBlob(svgText, width, height);
  downloadBlob(blob, filename);
}
