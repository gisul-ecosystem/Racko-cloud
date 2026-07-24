/**
 * Favicons must be square. Non-square uploads get letterboxed onto a transparent
 * square (contain) — never stretched — so browser tabs / apple-touch stay correct.
 */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load favicon image'));
    img.src = src;
  });
}

/** Draw source into a size×size PNG data URL, centered, preserving aspect ratio. */
export async function renderSquareFaviconDataUrl(
  source: string,
  size: number
): Promise<string> {
  if (typeof document === 'undefined') return source;

  const img = await loadImage(source);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;

  ctx.clearRect(0, 0, size, size);

  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  if (iw <= 0 || ih <= 0) return source;

  const scale = Math.min(size / iw, size / ih);
  const dw = Math.max(1, Math.round(iw * scale));
  const dh = Math.max(1, Math.round(ih * scale));
  const dx = Math.floor((size - dw) / 2);
  const dy = Math.floor((size - dh) / 2);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, dx, dy, dw, dh);

  return canvas.toDataURL('image/png');
}

export interface SquareFaviconSet {
  /** Browser tab / general icon */
  icon32: string;
  icon48: string;
  /** Apple touch / PWA-style slot */
  apple180: string;
  /** Compact square for localStorage cache */
  cache64: string;
}

export async function buildSquareFaviconSet(source: string): Promise<SquareFaviconSet> {
  const [icon32, icon48, apple180, cache64] = await Promise.all([
    renderSquareFaviconDataUrl(source, 32),
    renderSquareFaviconDataUrl(source, 48),
    renderSquareFaviconDataUrl(source, 180),
    renderSquareFaviconDataUrl(source, 64),
  ]);
  return { icon32, icon48, apple180, cache64 };
}
