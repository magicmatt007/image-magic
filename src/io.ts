import type { Editor } from './editor';
import { newCanvas } from './imageOps';
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

export async function loadBlob(ed: Editor, blob: Blob, name?: string) {
  try {
    ed.loadImage(await blobToCanvas(blob), name ?? (blob instanceof File ? blob.name : undefined));
  } catch {
    toast('That file could not be opened as an image', 'error');
  }
}

/** Paste via the Clipboard API (button). Ctrl+V uses the paste event instead. */
export async function pasteFromClipboard(ed: Editor) {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) {
        await loadBlob(ed, await item.getType(type), 'pasted');
        return;
      }
    }
    toast('No image on the clipboard', 'error');
  } catch {
    toast('Clipboard not available here. Try Ctrl+V', 'error');
  }
}

function toBlob(c: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), type, quality),
  );
}

export async function copyToClipboard(ed: Editor) {
  if (!ed.base) return;
  try {
    const blob = toBlob(ed.exportCanvas(), 'image/png');
    // Passing the promise keeps Safari happy (user activation must not lapse).
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    toast('Copied to clipboard');
  } catch {
    toast('Copying images is not supported in this browser', 'error');
  }
}

function withWhiteBackground(src: HTMLCanvasElement) {
  const c = newCanvas(src.width, src.height);
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, 0, 0);
  return c;
}

type SaveHandle = { name: string; createWritable(): Promise<{ write(b: Blob): Promise<void>; close(): Promise<void> }> };
type PickerWindow = Window & { showSaveFilePicker?: (opts: unknown) => Promise<SaveHandle> };

export async function saveImage(ed: Editor, format: 'png' | 'jpeg' = 'png') {
  if (!ed.base) return;
  const canvas = ed.exportCanvas();
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const suggestedName = `${ed.fileName}-annotated.${ext}`;
  const encode = (jpeg: boolean) =>
    jpeg ? toBlob(withWhiteBackground(canvas), 'image/jpeg', 0.92) : toBlob(canvas, 'image/png');

  const w = window as PickerWindow;
  if (w.showSaveFilePicker) {
    try {
      const png = { description: 'PNG image', accept: { 'image/png': ['.png'] } };
      const jpg = { description: 'JPEG image', accept: { 'image/jpeg': ['.jpg', '.jpeg'] } };
      const handle = await w.showSaveFilePicker({ suggestedName, types: format === 'jpeg' ? [jpg, png] : [png, jpg] });
      const blob = await encode(/\.jpe?g$/i.test(handle.name));
      const out = await handle.createWritable();
      await out.write(blob);
      await out.close();
      toast(`Saved ${handle.name}`);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') toast('Saving failed', 'error');
    }
    return;
  }
  const blob = await encode(format === 'jpeg');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = suggestedName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Paste, drag-and-drop, file picker and "Open with" from the OS. */
export function setupInputs(ed: Editor, fileInput: HTMLInputElement, dropZone: HTMLElement) {
  document.addEventListener('paste', (e) => {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
    const item = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    loadBlob(ed, file, 'pasted');
  });

  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) loadBlob(ed, f);
    fileInput.value = '';
  });

  let depth = 0;
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
  dropZone.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    depth++;
    dropZone.classList.add('dragging');
  });
  dropZone.addEventListener('dragleave', () => {
    if (--depth <= 0) {
      depth = 0;
      dropZone.classList.remove('dragging');
    }
  });
  dropZone.addEventListener('dragover', (e) => {
    if (hasFiles(e)) e.preventDefault();
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    dropZone.classList.remove('dragging');
    const f = [...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (f) loadBlob(ed, f);
    else toast('Drop an image file', 'error');
  });

  // Installed app opened via the OS "Open with" menu.
  type LaunchParams = { files: { getFile(): Promise<File> }[] };
  const lq = (window as unknown as { launchQueue?: { setConsumer(cb: (p: LaunchParams) => void): void } })
    .launchQueue;
  lq?.setConsumer(async (params) => {
    if (params.files.length) loadBlob(ed, await params.files[0].getFile());
  });
}
