import './ui/styles.css';
import { registerSW } from 'virtual:pwa-register';
import { Editor } from './editor';
import { FileSession, setupInputs } from './files';
import { blankCanvas } from './imageOps';
import { copyToClipboard } from './io';
import { buildFilePanel } from './ui/filePanel';
import { setupSaveTip } from './ui/saveTip';
import { TOOL_KEYS, buildStyleBar, buildToolbar } from './ui/toolbar';
import { toast } from './ui/toast';
import { versionLabel } from './version';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const workspace = $<HTMLElement>('#workspace');
const fileInput = $<HTMLInputElement>('#file');
const empty = $<HTMLElement>('#empty');
const status = $<HTMLElement>('#status');
const ed = new Editor($<HTMLDivElement>('#stage'));
const files = new FileSession(ed);
let updateReady = false; // set by the service worker when a new version is waiting

// ------------------------------------------------------------ resize dialog
const dlg = $<HTMLDialogElement>('#resize-dialog');
const rw = $<HTMLInputElement>('#resize-w');
const rh = $<HTMLInputElement>('#resize-h');
const rlock = $<HTMLInputElement>('#resize-lock');
const ratio = () => ed.width / ed.height;
rw.addEventListener('input', () => {
  if (rlock.checked) rh.value = String(Math.max(1, Math.round(Number(rw.value) / ratio())));
});
rh.addEventListener('input', () => {
  if (rlock.checked) rw.value = String(Math.max(1, Math.round(Number(rh.value) * ratio())));
});
dlg.querySelectorAll<HTMLButtonElement>('[data-pct]').forEach((b) =>
  b.addEventListener('click', () => {
    const k = Number(b.dataset.pct) / 100;
    rw.value = String(Math.round(ed.width * k));
    rh.value = String(Math.round(ed.height * k));
  }),
);
dlg.addEventListener('close', () => {
  if (dlg.returnValue === 'ok') ed.resize(Number(rw.value), Number(rh.value));
});

// ----------------------------------------------------------------- actions
fileInput.addEventListener('change', () => {
  const f = fileInput.files?.[0];
  if (f) files.openBlob(f, f.name, true);
  fileInput.value = '';
});

async function pasteButton() {
  try {
    for (const item of await navigator.clipboard.read()) {
      const type = item.types.find((t) => t.startsWith('image/'));
      if (type) return files.openBlob(await item.getType(type), 'pasted.png');
    }
    toast('No image on the clipboard', 'error');
  } catch {
    toast('Clipboard not available here. Try Ctrl+V', 'error');
  }
}

const panel = buildFilePanel($('#files'), ed, files);
const saveTip = setupSaveTip($<HTMLDialogElement>('#save-tip'));
files.onDownloaded = saveTip.afterDownload;

const actions = {
  open: async () => {
    if (!(await files.pickFile())) fileInput.click();
  },
  openFolder: () => {
    if (!panel.open) panel.toggle();
    files.pickFolder();
  },
  togglePanel: () => panel.toggle(),
  prev: () => files.step(-1),
  next: () => files.step(1),
  paste: pasteButton,
  blank: () => files.openBlank(blankCanvas(1280, 720)),
  copy: () => copyToClipboard(ed),
  save: () => files.save(),
  saveAs: () => files.saveAs(),
  resize: () => {
    if (!ed.base) return;
    rw.value = String(ed.width);
    rh.value = String(ed.height);
    dlg.returnValue = '';
    dlg.showModal();
  },
  fileState: () => ({
    panelOpen: panel.open,
    folder: !!files.folderName,
    index: files.currentIndex(),
    count: files.visible.length,
    inPlace: files.canSaveInPlace && !files.writeBlocked ? files.handle!.name : null,
    downloads: files.writeBlocked,
  }),
};

buildToolbar($('#toolbar'), ed, actions);
buildStyleBar($('#stylebar'), ed);
setupInputs(files, workspace);

for (const [act, fn] of Object.entries({
  open: actions.open,
  folder: actions.openFolder,
  paste: actions.paste,
  blank: actions.blank,
})) {
  const b = empty.querySelector<HTMLButtonElement>(`[data-act=${act}]`)!;
  b.addEventListener('click', fn);
}

ed.onChange(() => {
  empty.hidden = !!ed.base;
  workspace.classList.toggle('has-image', !!ed.base);
  const dirty = ed.dirty;
  document.title = ed.base ? `${dirty ? '● ' : ''}${files.name || 'image'} – image-magic` : 'image-magic';
  status.replaceChildren();
  if (ed.base) {
    const parts = [files.name || 'image', `${ed.width} × ${ed.height}px`, `${Math.round(ed.scale * 100)}%`];
    const info = document.createElement('span');
    info.textContent = parts.join(' · ') + (dirty ? ' · unsaved' : '');
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = ed.tool.hint;
    status.append(info, hint);
  }
  const right = document.createElement('span');
  right.className = 'status-right';
  if (files.writeBlocked) {
    const why = document.createElement('button');
    why.type = 'button';
    why.className = 'link';
    why.textContent = 'Save downloads a copy – why?';
    why.addEventListener('click', () => saveTip.show());
    right.append(why);
  }
  if (updateReady) {
    const upd = document.createElement('button');
    upd.type = 'button';
    upd.className = 'link update';
    upd.textContent = 'New version available – update';
    upd.addEventListener('click', applyUpdate);
    right.append(upd);
  }
  const ver = document.createElement('span');
  ver.className = 'version';
  ver.textContent = versionLabel();
  ver.title = 'App version (commit and build time)';
  right.append(ver);
  status.append(right);
});
ed.changed();

window.addEventListener('beforeunload', (e) => {
  ed.settle();
  if (ed.dirty) e.preventDefault();
});

// --------------------------------------------------------------- keyboard
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;

window.addEventListener('keydown', (e) => {
  if (isTyping(e.target) || document.querySelector('dialog[open]')) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();

  if (ed.tool.key?.(e)) {
    e.preventDefault();
    return;
  }

  if (mod) {
    const handled = (() => {
      if (k === 'z' && !e.shiftKey) ed.undo();
      else if ((k === 'z' && e.shiftKey) || k === 'y') ed.redo();
      else if (k === 's') (e.shiftKey ? actions.saveAs : actions.save)();
      else if (k === 'o') (e.shiftKey ? actions.openFolder : actions.open)();
      else if (k === 'b') actions.togglePanel();
      else if (k === 'f' && files.folderName) panel.focusSearch();
      else if (k === 'd') ed.duplicateSelected();
      else if (k === 'a') {
        ed.setTool('select');
        ed.select(ed.annoLayer.getChildren().slice());
      } else if (k === 'c' && (e.shiftKey || !window.getSelection()?.toString())) copyToClipboard(ed);
      else if (k === '0') ed.fit();
      else if (k === '1') ed.actualSize();
      else if (k === '=' || k === '+') ed.zoomBy(1.25);
      else if (k === '-') ed.zoomBy(1 / 1.25);
      else return false;
      return true;
    })();
    if (handled) e.preventDefault();
    return;
  }

  if (e.key === 'PageDown' || e.key === 'PageUp') {
    e.preventDefault();
    files.step(e.key === 'PageDown' ? 1 : -1);
    return;
  }
  if (e.key === ' ') {
    e.preventDefault();
    ed.setPanning(true);
    return;
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault();
    ed.deleteSelected();
    return;
  }
  if (e.key === 'Escape') {
    ed.select([]);
    return;
  }
  if (e.key === ']') return ed.reorderSelected(true);
  if (e.key === '[') return ed.reorderSelected(false);
  if (!e.altKey && TOOL_KEYS[k] && ed.base) ed.setTool(TOOL_KEYS[k]);
});

window.addEventListener('keyup', (e) => {
  if (e.key === ' ') ed.setPanning(false);
});
window.addEventListener('blur', () => ed.setPanning(false));

files.restoreFolder();

if (import.meta.env.DEV) Object.assign(window, { ed, files }); // for debugging

// ------------------------------------------------------------------ updates
// A new version is installed in the background. It is switched to right away
// when nothing is being edited; otherwise the status bar offers an update
// button, so unsaved annotations are never lost to a reload.
let swRegistration: ServiceWorkerRegistration | undefined;
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (!ed.base) {
      updateSW(true);
      return;
    }
    updateReady = true;
    ed.changed();
  },
  onRegisteredSW(_url, r) {
    swRegistration = r;
    setInterval(() => r?.update(), 30 * 60 * 1000);
  },
});
// Check for a newer version whenever the app comes back to the foreground.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') swRegistration?.update().catch(() => {});
});

async function applyUpdate() {
  if (!(await files.confirmDiscard())) return;
  ed.markSaved(); // already confirmed; don't ask again in beforeunload
  updateSW(true);
}
