import type { Editor } from '../editor';
import type { ToolName } from '../tools';
import { PALETTE } from '../style';
import { icon } from './icons';

export interface Actions {
  open(): void;
  openFolder(): void;
  togglePanel(): void;
  prev(): void;
  next(): void;
  paste(): void;
  blank(): void;
  copy(): void;
  save(): void;
  saveAs(): void;
  resize(): void;
  /** Current file state, for button labels and enabled states. */
  fileState(): { panelOpen: boolean; folder: boolean; index: number; count: number; inPlace: string | null; downloads: boolean };
}

export const TOOL_KEYS: Record<string, ToolName> = {
  v: 'select',
  a: 'arrow',
  l: 'line',
  r: 'rect',
  e: 'ellipse',
  p: 'pen',
  t: 'text',
  h: 'highlight',
  n: 'step',
  b: 'blur',
  c: 'crop',
};

const TOOLS: [ToolName, string, string][] = [
  ['select', 'Select & move', 'V'],
  ['arrow', 'Arrow', 'A'],
  ['line', 'Line', 'L'],
  ['rect', 'Rectangle', 'R'],
  ['ellipse', 'Ellipse', 'E'],
  ['pen', 'Freehand', 'P'],
  ['text', 'Text', 'T'],
  ['highlight', 'Highlighter', 'H'],
  ['step', 'Numbered step', 'N'],
  ['blur', 'Pixelate / hide', 'B'],
  ['crop', 'Crop', 'C'],
];

function btn(name: string, title: string, onClick: () => void, extra = '') {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `icon-btn ${extra}`.trim();
  b.title = title;
  b.setAttribute('aria-label', title);
  b.innerHTML = icon(name);
  b.addEventListener('click', onClick);
  return b;
}

function group(...children: HTMLElement[]) {
  const g = document.createElement('div');
  g.className = 'group';
  g.append(...children);
  return g;
}

export function buildToolbar(el: HTMLElement, ed: Editor, act: Actions) {
  const toolBtns = new Map<ToolName, HTMLButtonElement>();
  for (const [name, title, key] of TOOLS) {
    const b = btn(name, `${title} (${key})`, () => ed.setTool(name));
    b.setAttribute('aria-pressed', 'false');
    toolBtns.set(name, b);
  }

  const undo = btn('undo', 'Undo (Ctrl+Z)', () => ed.undo());
  const redo = btn('redo', 'Redo (Ctrl+Shift+Z)', () => ed.redo());
  const dup = btn('duplicate', 'Duplicate (Ctrl+D)', () => ed.duplicateSelected());
  const front = btn('front', 'Bring to front (])', () => ed.reorderSelected(true));
  const back = btn('back', 'Send to back ([)', () => ed.reorderSelected(false));
  const del = btn('trash', 'Delete (Del)', () => ed.deleteSelected());
  const selectionBtns = [dup, front, back, del];

  const zoomLabel = document.createElement('button');
  zoomLabel.type = 'button';
  zoomLabel.className = 'zoom-label';
  zoomLabel.title = 'Actual size (Ctrl+1)';
  zoomLabel.addEventListener('click', () => ed.actualSize());

  const save = btn('save', 'Save (Ctrl+S)', act.save, 'primary');
  save.insertAdjacentHTML('beforeend', '<span>Save</span>');
  const saveAs = btn('saveAs', 'Save as… (Ctrl+Shift+S)', act.saveAs);
  const panelBtn = btn('panel', 'Show folder panel (Ctrl+B)', act.togglePanel);
  const prev = btn('prev', 'Previous image in folder (Page Up)', act.prev);
  const next = btn('next', 'Next image in folder (Page Down)', act.next);

  const imageBtns = [
    btn('rotateL', 'Rotate left', () => ed.rotate(false)),
    btn('rotateR', 'Rotate right', () => ed.rotate(true)),
    btn('flipH', 'Flip horizontally', () => ed.flip(true)),
    btn('flipV', 'Flip vertically', () => ed.flip(false)),
    btn('resize', 'Resize image…', act.resize),
  ];
  const viewBtns = [
    btn('zoomOut', 'Zoom out (Ctrl+−)', () => ed.zoomBy(1 / 1.25)),
    zoomLabel,
    btn('zoomIn', 'Zoom in (Ctrl+=)', () => ed.zoomBy(1.25)),
    btn('fit', 'Fit to window (Ctrl+0)', () => ed.fit()),
  ];
  const copy = btn('copy', 'Copy image to clipboard (Ctrl+Shift+C)', act.copy);

  const brand = document.createElement('div');
  brand.className = 'brand';
  brand.innerHTML = '<img src="./icon.svg" alt="" width="22" height="22"><span>image-magic</span>';

  el.append(
    brand,
    group(
      panelBtn,
      btn('open', 'Open image (Ctrl+O)', act.open),
      btn('folder', 'Open folder (Ctrl+Shift+O)', act.openFolder),
      btn('paste', 'Paste image from clipboard (Ctrl+V)', act.paste),
      btn('new', 'New blank canvas', act.blank),
      prev,
      next,
    ),
    group(...toolBtns.values()),
    group(undo, redo),
    group(...selectionBtns),
    group(...imageBtns),
    group(...viewBtns),
    group(copy, saveAs, save),
  );

  const needImage = [...toolBtns.values(), ...imageBtns, ...viewBtns, copy, save, saveAs];
  ed.onChange(() => {
    const has = !!ed.base;
    for (const [name, b] of toolBtns) {
      const on = name === ed.toolName;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    }
    needImage.forEach((b) => ((b as HTMLButtonElement).disabled = !has));
    undo.disabled = !ed.history.canUndo;
    redo.disabled = !ed.history.canRedo;
    const sel = ed.selected().length > 0;
    selectionBtns.forEach((b) => (b.disabled = !sel));
    zoomLabel.textContent = `${Math.round(ed.scale * 100)}%`;
    const f = act.fileState();
    panelBtn.classList.toggle('active', f.panelOpen);
    panelBtn.setAttribute('aria-pressed', String(f.panelOpen));
    prev.hidden = next.hidden = !f.folder;
    prev.disabled = f.index <= 0;
    next.disabled = f.index < 0 ? f.count === 0 : f.index >= f.count - 1;
    save.title = f.downloads
      ? 'Save (Ctrl+S): downloads under the original name, because this browser may not write files'
      : f.inPlace
        ? `Save over ${f.inPlace} (Ctrl+S)`
        : 'Save (Ctrl+S)';
  });
}

export function buildStyleBar(el: HTMLElement, ed: Editor) {
  const st = ed.style;

  const swatches = PALETTE.map((c) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'swatch';
    b.style.setProperty('--c', c);
    b.title = c;
    b.setAttribute('aria-label', `Colour ${c}`);
    b.addEventListener('click', () => st.set('color', c));
    return b;
  });
  const custom = document.createElement('input');
  custom.type = 'color';
  custom.title = 'Custom colour';
  custom.className = 'custom-color';
  custom.addEventListener('input', () => st.set('color', custom.value));

  const slider = (label: string, min: number, max: number, key: 'strokeWidth' | 'fontSize') => {
    const wrap = document.createElement('label');
    wrap.className = 'slider';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    const out = document.createElement('output');
    wrap.append(label, input, out);
    input.addEventListener('input', () => st.set(key, Number(input.value)));
    return { wrap, input, out };
  };
  const width = slider('Width', 1, 24, 'strokeWidth');
  const size = slider('Text', 10, 120, 'fontSize');

  const fillWrap = document.createElement('label');
  fillWrap.className = 'check';
  fillWrap.title = 'Shapes: filled · Text: outlined for contrast';
  const fill = document.createElement('input');
  fill.type = 'checkbox';
  fill.addEventListener('change', () => st.set('fill', fill.checked));
  fillWrap.append(fill, 'Fill / outline');

  el.append(group(...swatches, custom), width.wrap, size.wrap, fillWrap);

  const sync = () => {
    const s = st.state;
    swatches.forEach((b) => b.classList.toggle('active', b.style.getPropertyValue('--c').toLowerCase() === s.color.toLowerCase()));
    custom.value = /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#000000';
    width.input.value = String(s.strokeWidth);
    width.out.textContent = String(s.strokeWidth);
    size.input.value = String(s.fontSize);
    size.out.textContent = String(s.fontSize);
    fill.checked = s.fill;
  };
  st.onChange((key) => {
    sync();
    if (key) ed.applyStyleToSelection(key);
  });
  sync();
}
