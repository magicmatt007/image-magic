/**
 * Files on disk: open/save-in-place via the File System Access API
 * (Chrome, Edge and other Chromium browsers), plus browsing a folder of
 * images. Other browsers fall back to the file picker and downloads.
 */
import type { Editor } from './editor';
import { blobToCanvas, downloadBlob, encode, formatFor, type Format } from './io';
import { toast } from './ui/toast';

type Perm = 'granted' | 'denied' | 'prompt';
type Mode = { mode: 'read' | 'readwrite' };
type WithPerm = { queryPermission?(m: Mode): Promise<Perm>; requestPermission?(m: Mode): Promise<Perm> };
type PickerType = { description: string; accept: Record<string, string[]> };
type FsWindow = Window & {
  showOpenFilePicker?(o: { types?: PickerType[]; id?: string; multiple?: boolean }): Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?(o: { suggestedName?: string; types?: PickerType[]; id?: string; startIn?: unknown }): Promise<FileSystemFileHandle>;
  showDirectoryPicker?(o: { id?: string; mode?: 'read' | 'readwrite'; startIn?: unknown }): Promise<FileSystemDirectoryHandle>;
};
const w = window as FsWindow;

export const fsSupported = typeof w.showOpenFilePicker === 'function';
export const folderSupported = typeof w.showDirectoryPicker === 'function';

export const IMAGE_RE = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
const IMAGE_TYPES: PickerType[] = [
  { description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.avif'] } },
];
const SAVE_TYPES: Record<Format, PickerType> = {
  png: { description: 'PNG image', accept: { 'image/png': ['.png'] } },
  jpeg: { description: 'JPEG image', accept: { 'image/jpeg': ['.jpg', '.jpeg'] } },
  webp: { description: 'WebP image', accept: { 'image/webp': ['.webp'] } },
};

async function hasPermission(h: FileSystemHandle, mode: Mode['mode'], ask: boolean) {
  const p = h as unknown as WithPerm;
  if (!p.queryPermission) return true;
  if ((await p.queryPermission({ mode })) === 'granted') return true;
  return ask && !!p.requestPermission && (await p.requestPermission({ mode })) === 'granted';
}

const isAbort = (e: unknown) => (e as Error)?.name === 'AbortError';
/** Short technical description of an error, for messages. */
const errText = (e: unknown) => {
  const err = e as Error;
  return err?.name ? `${err.name}${err.message ? `: ${err.message}` : ''}` : String(e);
};

// ------------------------------------------------- remembered folder (IndexedDB)
const DB = 'image-magic', STORE = 'kv';
function idb<T>(fn: (s: IDBObjectStore) => IDBRequest<T>, mode: IDBTransactionMode): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const req = fn(open.result.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    };
  });
}
const idbGet = <T>(k: string) => idb<T>((s) => s.get(k) as IDBRequest<T>, 'readonly').catch(() => undefined);
const idbSet = (k: string, v: unknown) => idb((s) => s.put(v, k), 'readwrite').catch(() => undefined);

// ------------------------------------------------------------------ session

/** An image in the opened folder: a real handle, or (basic mode) a plain File. */
export interface FileEntry {
  name: string;
  modified: number;
  handle?: FileSystemFileHandle;
  file?: File;
}

export class FileSession {
  /** File currently being edited (null for pasted/dropped-without-handle images). */
  handle: FileSystemFileHandle | null = null;
  /** Name of the current file, also when there is no handle. */
  name = '';
  /** Plain file being edited when it came from a basic-mode folder. */
  private currentFile: File | null = null;
  dir: FileSystemDirectoryHandle | null = null;
  /** Name of the open folder (full access or basic mode), or null. */
  folderName: string | null = null;
  /**
   * Basic mode: the folder was picked with a classic folder input, because
   * the browser (or a company policy) does not allow folder access. Images
   * can be browsed, but not saved in place and the list cannot refresh.
   */
  basic = false;
  /** Why the last attempt to open a folder failed, shown in the panel. */
  folderError: string | null = null;
  /** A folder remembered from last time that still needs permission. */
  pendingDir: FileSystemDirectoryHandle | null = null;
  entries: FileEntry[] = [];
  private listeners = new Set<() => void>();
  private unsavedDialog: HTMLDialogElement;

  constructor(private ed: Editor) {
    this.unsavedDialog = document.querySelector('#unsaved-dialog')!;
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
  }

  private emit() {
    this.listeners.forEach((l) => l());
    this.ed.changed();
  }

  get canSaveInPlace() {
    return !!this.handle && !!formatFor(this.handle.name);
  }

  // ------------------------------------------------------------- unsaved

  /** Ask before throwing away edits. Resolves false if the user cancels. */
  async confirmDiscard(): Promise<boolean> {
    this.ed.settle();
    if (!this.ed.dirty) return true;
    const d = this.unsavedDialog;
    d.querySelector('[data-name]')!.textContent = this.name || 'this image';
    d.returnValue = '';
    d.showModal();
    const choice = await new Promise<string>((r) => d.addEventListener('close', () => r(d.returnValue), { once: true }));
    if (choice === 'save') return this.save();
    return choice === 'discard';
  }

  // ---------------------------------------------------------------- open

  /** Open an image that has no file behind it (paste, plain drop). */
  async openBlob(blob: Blob, name: string) {
    if (!(await this.confirmDiscard())) return;
    try {
      const canvas = await blobToCanvas(blob);
      this.handle = null;
      this.currentFile = null;
      this.name = name;
      this.ed.loadImage(canvas, name);
      this.emit();
    } catch {
      toast('That file could not be opened as an image', 'error');
    }
  }

  async openHandle(h: FileSystemFileHandle) {
    if (h === this.handle) return;
    if (!(await this.confirmDiscard())) return;
    try {
      const file = await h.getFile();
      const canvas = await blobToCanvas(file);
      this.handle = h;
      this.currentFile = null;
      this.name = file.name;
      this.ed.loadImage(canvas, file.name);
      this.emit();
    } catch (e) {
      toast(`Could not open ${h.name} (${errText(e)})`, 'error');
    }
  }

  /** Open an image from a basic-mode folder (no handle, so Save makes a copy). */
  async openFile(f: File) {
    if (f === this.currentFile) return;
    if (!(await this.confirmDiscard())) return;
    try {
      const canvas = await blobToCanvas(f);
      this.handle = null;
      this.currentFile = f;
      this.name = f.name;
      this.ed.loadImage(canvas, f.name);
      this.emit();
    } catch (e) {
      toast(`Could not open ${f.name} (${errText(e)})`, 'error');
    }
  }

  openEntry(e: FileEntry) {
    return e.handle ? this.openHandle(e.handle) : this.openFile(e.file!);
  }

  async openBlank(canvas: HTMLCanvasElement) {
    if (!(await this.confirmDiscard())) return;
    this.handle = null;
    this.currentFile = null;
    this.name = 'untitled.png';
    this.ed.loadImage(canvas, 'untitled');
    this.emit();
  }

  /**
   * File picker. Returns false when the caller should use <input type=file>
   * instead: the API is missing, or the browser refused (e.g. company policy).
   */
  async pickFile(): Promise<boolean> {
    if (!w.showOpenFilePicker) return false;
    try {
      const [h] = await w.showOpenFilePicker({ types: IMAGE_TYPES, id: 'image-magic' });
      await this.openHandle(h);
      return true;
    } catch (e) {
      if (isAbort(e)) return true;
      console.warn('showOpenFilePicker failed, using the classic file picker', e);
      return false;
    }
  }

  // -------------------------------------------------------------- folder

  /**
   * Pick a folder with full access (read + write). If the browser refuses,
   * try read-only access; if that is refused too, record the reason so the
   * panel can offer basic mode.
   */
  async pickFolder() {
    if (!w.showDirectoryPicker) return this.pickFolderBasic();
    let dir: FileSystemDirectoryHandle;
    try {
      dir = await w.showDirectoryPicker({ id: 'image-magic', mode: 'readwrite' });
    } catch (e) {
      if (isAbort(e)) return;
      console.warn('showDirectoryPicker (readwrite) failed', e);
      try {
        dir = await w.showDirectoryPicker({ id: 'image-magic', mode: 'read' });
      } catch (e2) {
        if (isAbort(e2)) return;
        console.warn('showDirectoryPicker (read) failed', e2);
        this.folderError = errText(e);
        this.emit();
        return;
      }
    }
    await this.useFolder(dir);
  }

  /**
   * Basic mode: the classic folder input, which works everywhere (also when
   * folder access is blocked). Must be called directly from a click.
   */
  pickFolderBasic() {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.addEventListener('change', async () => {
      const all = [...(input.files ?? [])];
      // Only the folder itself, not its sub-folders.
      const images = all.filter((f) => IMAGE_RE.test(f.name) && f.webkitRelativePath.split('/').length === 2);
      if (!all.length) return;
      this.dir = null;
      this.basic = true;
      this.folderError = null;
      this.folderName = all[0].webkitRelativePath.split('/')[0] || 'Folder';
      this.entries = images
        .map((f) => ({ name: f.name, modified: f.lastModified, file: f }))
        .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' }));
      this.emit();
      if (!this.ed.base && this.entries.length) await this.openEntry(this.entries[0]);
    });
    input.click();
  }

  async useFolder(dir: FileSystemDirectoryHandle) {
    this.dir = dir;
    this.folderName = dir.name;
    this.basic = false;
    this.folderError = null;
    this.pendingDir = null;
    idbSet('lastDir', dir);
    await this.refresh();
    // Open the newest image if nothing is being edited yet.
    if (!this.ed.base && this.entries.length) await this.openEntry(this.entries[0]);
  }

  /** On startup: reconnect the folder used last time (silently if allowed). */
  async restoreFolder() {
    if (!folderSupported) return;
    const dir = await idbGet<FileSystemDirectoryHandle>('lastDir');
    if (!dir) return;
    if (await hasPermission(dir, 'read', false)) {
      this.dir = dir;
      this.folderName = dir.name;
      await this.refresh();
    } else {
      this.pendingDir = dir;
      this.emit();
    }
  }

  /** Needs a click (user gesture) to show the permission prompt. */
  async reconnect() {
    const dir = this.pendingDir;
    if (!dir) return;
    try {
      if (await hasPermission(dir, 'read', true)) await this.useFolder(dir);
      else toast('Permission to the folder was not granted', 'error');
    } catch {
      this.pendingDir = null;
      toast('That folder is no longer available', 'error');
      this.emit();
    }
  }

  /**
   * Re-read the folder. Sorted by name, descending: screenshot and camera
   * names contain a timestamp or counter, so this is newest first, and the
   * order stays put when a file is saved (unlike sorting by modified time).
   */
  async refresh() {
    if (!this.dir || this.basic) return;
    const list: FileEntry[] = [];
    try {
      for await (const h of this.dir.values()) {
        if (h.kind !== 'file' || !IMAGE_RE.test(h.name)) continue;
        const fh = h as FileSystemFileHandle;
        const f = await fh.getFile();
        // Keep the handle we are editing, so isSameEntry checks stay cheap.
        const same = this.handle && (await this.handle.isSameEntry(fh));
        list.push({ name: h.name, handle: same ? this.handle! : fh, modified: f.lastModified });
      }
    } catch (e) {
      toast(`Could not read the folder (${errText(e)})`, 'error');
    }
    list.sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: 'base' }));
    this.entries = list;
    this.emit();
  }

  /** Index of the current file in the folder list, or -1. */
  currentIndex() {
    return this.entries.findIndex(
      (e) => (!!e.handle && e.handle === this.handle) || (!!e.file && e.file === this.currentFile),
    );
  }

  /** Open the next (+1) or previous (-1) image in the folder. */
  async step(delta: number) {
    if (!this.entries.length) return;
    const i = this.currentIndex();
    const next = i < 0 ? 0 : i + delta;
    if (next < 0 || next >= this.entries.length) return;
    await this.openEntry(this.entries[next]);
  }

  // ---------------------------------------------------------------- save

  private async write(h: FileSystemFileHandle, format: Format) {
    const blob = await encode(this.ed.exportCanvas(), format);
    const out = await h.createWritable();
    await out.write(blob);
    await out.close();
  }

  /** Save over the opened file; falls back to "Save as". Resolves true when saved. */
  async save(): Promise<boolean> {
    if (!this.ed.base) return false;
    this.ed.settle();
    const h = this.handle;
    const format = h && formatFor(h.name);
    if (!h || !format) return this.saveAs();
    try {
      if (!(await hasPermission(h, 'readwrite', true))) return this.saveAs();
      await this.write(h, format);
      this.ed.markSaved();
      toast(`Saved ${h.name}`);
      this.touch(h);
      return true;
    } catch (e) {
      toast(`Could not write ${h.name} (${errText(e)}). Try Save as`, 'error');
      return false;
    }
  }

  async saveAs(): Promise<boolean> {
    if (!this.ed.base) return false;
    this.ed.settle();
    const current = this.handle ? formatFor(this.handle.name) : null;
    const preferred: Format = current ?? 'png';
    const base = this.name.replace(/\.[^.]+$/, '') || 'image';
    const suggestedName = `${this.handle ? base : base + '-annotated'}.${preferred === 'jpeg' ? 'jpg' : preferred}`;

    const download = async () => {
      downloadBlob(await encode(this.ed.exportCanvas(), preferred), suggestedName);
      this.ed.markSaved();
      toast(`Downloaded ${suggestedName}`);
      return true;
    };
    if (!w.showSaveFilePicker) return download();
    try {
      const order: Format[] = [preferred, ...(['png', 'jpeg', 'webp'] as Format[]).filter((f) => f !== preferred)];
      const h = await w.showSaveFilePicker({
        suggestedName,
        types: order.map((f) => SAVE_TYPES[f]),
        id: 'image-magic',
        startIn: this.handle ?? this.dir ?? 'pictures',
      });
      await this.write(h, formatFor(h.name) ?? 'png');
      this.handle = h;
      this.name = h.name;
      this.ed.fileName = h.name.replace(/\.[^.]+$/, '');
      this.ed.markSaved();
      toast(`Saved ${h.name}`);
      if (this.dir) await this.refresh();
      else this.emit();
      return true;
    } catch (e) {
      if (isAbort(e)) return false;
      // Save dialog refused (e.g. company policy): download a copy instead.
      console.warn('showSaveFilePicker failed, downloading instead', e);
      return download();
    }
  }

  /** Update the folder list after writing a file in it. */
  private touch(h: FileSystemFileHandle) {
    const e = this.entries.find((x) => x.handle === h);
    if (e) e.modified = Date.now();
    this.emit();
  }
}

/** Paste, drag-and-drop and "Open with" from the OS. */
export function setupInputs(files: FileSession, dropZone: HTMLElement) {
  document.addEventListener('paste', (e) => {
    const el = document.activeElement;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;
    const item = [...(e.clipboardData?.items ?? [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    const file = item?.getAsFile();
    if (!file) return;
    e.preventDefault();
    files.openBlob(file, 'pasted.png');
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
  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    depth = 0;
    dropZone.classList.remove('dragging');
    const items = [...(e.dataTransfer?.items ?? [])].filter((i) => i.kind === 'file');
    const plainFile = items.map((i) => i.getAsFile()).find((f) => f && IMAGE_RE.test(f.name)) ?? null;
    // Chromium hands out real file/folder handles, so saving goes back to the file.
    type WithHandle = DataTransferItem & { getAsFileSystemHandle?(): Promise<FileSystemHandle | null> };
    const handles = await Promise.all(items.map((i) => (i as WithHandle).getAsFileSystemHandle?.() ?? null));
    const dir = handles.find((h) => h?.kind === 'directory') as FileSystemDirectoryHandle | undefined;
    if (dir) {
      if (await hasPermission(dir, 'readwrite', true)) await files.useFolder(dir);
      return;
    }
    const fh = handles.find((h) => h?.kind === 'file' && IMAGE_RE.test(h.name)) as FileSystemFileHandle | undefined;
    if (fh) return files.openHandle(fh);
    if (plainFile) return files.openBlob(plainFile, plainFile.name);
    toast('Drop an image file or a folder', 'error');
  });

  // Installed app opened via the OS "Open with" menu.
  type LaunchParams = { files: FileSystemFileHandle[] };
  const lq = (window as unknown as { launchQueue?: { setConsumer(cb: (p: LaunchParams) => void): void } }).launchQueue;
  lq?.setConsumer((params) => {
    if (params.files.length) files.openHandle(params.files[0]);
  });
}
