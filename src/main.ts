import './ui/styles.css';
import { registerSW } from 'virtual:pwa-register';
import { Editor } from './editor';
import { blankCanvas } from './imageOps';
import { copyToClipboard, pasteFromClipboard, saveImage, setupInputs } from './io';
import { TOOL_KEYS, buildStyleBar, buildToolbar } from './ui/toolbar';

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const workspace = $<HTMLElement>('#workspace');
const fileInput = $<HTMLInputElement>('#file');
const empty = $<HTMLElement>('#empty');
const status = $<HTMLElement>('#status');
const ed = new Editor($<HTMLDivElement>('#stage'));

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

const actions = {
  open: () => fileInput.click(),
  paste: () => pasteFromClipboard(ed),
  blank: () => ed.loadImage(blankCanvas(1280, 720), 'blank'),
  copy: () => copyToClipboard(ed),
  save: () => saveImage(ed),
  resize: () => {
    if (!ed.base) return;
    rw.value = String(ed.width);
    rh.value = String(ed.height);
    dlg.returnValue = '';
    dlg.showModal();
  },
};

buildToolbar($('#toolbar'), ed, actions);
buildStyleBar($('#stylebar'), ed);
setupInputs(ed, fileInput, workspace);

empty.querySelector('[data-act=open]')!.addEventListener('click', actions.open);
empty.querySelector('[data-act=paste]')!.addEventListener('click', actions.paste);
empty.querySelector('[data-act=blank]')!.addEventListener('click', actions.blank);

ed.onChange(() => {
  empty.hidden = !!ed.base;
  workspace.classList.toggle('has-image', !!ed.base);
  status.innerHTML = '';
  if (!ed.base) return;
  const info = document.createElement('span');
  info.textContent = `${ed.width} × ${ed.height}px · ${Math.round(ed.scale * 100)}%`;
  const hint = document.createElement('span');
  hint.className = 'hint';
  hint.textContent = ed.tool.hint;
  status.append(info, hint);
});
ed.changed();

// --------------------------------------------------------------- keyboard
const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement;

window.addEventListener('keydown', (e) => {
  if (isTyping(e.target) || dlg.open) return;
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
      else if (k === 's') saveImage(ed, e.shiftKey ? 'jpeg' : 'png');
      else if (k === 'o') actions.open();
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

if (import.meta.env.DEV) (window as unknown as { ed: Editor }).ed = ed; // for debugging

// Installable / offline (no-op in dev).
registerSW({ immediate: true });
