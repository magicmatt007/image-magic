import type { Editor } from './editor';
import { newCanvas } from './imageOps';
import { platform } from './platform/hooks';
import { toast } from './ui/toast';

/** Decode an image file/blob into a canvas (respecting EXIF orientation). */
export async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  try {
    const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const c = newCanvas(bmp.width, bmp.height);
    c.getContext('2d')!.drawImage(bmp, 0, 0);
    bmp.close();
    return c;
  } catch {
    // e.g. SVG files, which createImageBitmap does not accept
    const url = URL.createObjectURL(blob);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = newCanvas(img.naturalWidth || 800, img.naturalHeight || 600);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      return c;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

export function toBlob(c: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), type, quality),
  );
}

export type Format = 'png' | 'jpeg' | 'webp';

/** The format to write for a file name, or null if browsers cannot encode it. */
export function formatFor(name: string): Format | null {
  const ext = /\.([^.]+)$/.exec(name)?.[1]?.toLowerCase();
  if (ext === 'png') return 'png';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpeg';
  if (ext === 'webp') return 'webp';
  return null;
}

function withWhiteBackground(src: HTMLCanvasElement) {
  const c = newCanvas(src.width, src.height);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0);
  return c;
}

export function encode(canvas: HTMLCanvasElement, format: Format) {
  if (format === 'jpeg') return toBlob(withWhiteBackground(canvas), 'image/jpeg', 0.92);
  if (format === 'webp') return toBlob(canvas, 'image/webp', 0.92);
  return toBlob(canvas, 'image/png');
}

export async function copyToClipboard(ed: Editor) {
  if (!ed.base) return;
  const blob = toBlob(ed.exportCanvas(), 'image/png');
  try {
    // Passing the promise keeps Safari happy (user activation must not lapse).
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Copied to clipboard');
  } catch {
    if (platform.copyImage) {
      try {
        await platform.copyImage(await blob);
        toast('Copied to clipboard');
        return;
      } catch {
        /* fall through */
      }
    }
    toast('Copying images is not supported in this browser', 'error');
  }
}

/** Share the annotated image via the system share sheet (Android, Windows…). */
export async function shareImage(ed: Editor, name: string) {
  if (!ed.base) return;
  try {
    const blob = await toBlob(ed.exportCanvas(), 'image/png');
    const base = name.replace(/\.[^.]+$/, '') || 'image';
    const file = new File([blob], `${base}-annotated.png`, { type: 'image/png' });
    await navigator.share({ files: [file], title: file.name });
  } catch (e) {
    if ((e as Error).name !== 'AbortError') toast('Sharing failed', 'error');
  }
}

/** Fallback for browsers without the File System Access API. */
export function downloadBlob(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
