import Konva from 'konva';
import { coarsePointer, type Editor } from '../editor';
import { FONT, makeText } from '../shapes';
import type { Tool } from './types';

export interface TextTool extends Tool {
  edit(node: Konva.Text): void;
  /** Commit any text being edited. Safe to call at any time. */
  finish(): void;
}

/** Click to place text; editing happens in a textarea laid over the canvas. */
export function textTool(ed: Editor): TextTool {
  let ta: HTMLTextAreaElement | null = null;
  /** Touch screens have no Esc/Ctrl+Enter: a Done button finishes instead. */
  let doneBtn: HTMLButtonElement | null = null;
  /** Click recorded on press and acted on at release (pinch-safe). */
  let pending: { p: { x: number; y: number }; hit: Konva.Node | null } | null = null;
  let node: Konva.Text | null = null;
  let before = '';
  let openedAt = 0;

  function autosize() {
    if (!ta) return;
    ta.style.width = '0px';
    ta.style.height = '0px';
    ta.style.width = ta.scrollWidth + 4 + 'px';
    ta.style.height = ta.scrollHeight + 'px';
    if (doneBtn) {
      doneBtn.style.left = ta.offsetLeft + 'px';
      doneBtn.style.top = ta.offsetTop + ta.offsetHeight + 6 + 'px';
    }
  }

  function edit(n: Konva.Text) {
    finish();
    node = n;
    before = n.text();
    ed.select([]);
    n.visible(false);
    ed.annoLayer.batchDraw();

    const abs = n.getAbsolutePosition();
    const s = n.getAbsoluteScale().x;
    const t = document.createElement('textarea');
    t.className = 'text-editor';
    t.value = n.text();
    t.spellcheck = false;
    t.placeholder = 'Type…';
    Object.assign(t.style, {
      left: abs.x + 'px',
      top: abs.y + 'px',
      font: `bold ${n.fontSize() * s}px ${FONT}`,
      lineHeight: String(n.lineHeight()),
      padding: n.padding() * s + 'px',
      color: n.fill() as string,
      transform: `rotate(${n.getAbsoluteRotation()}deg)`,
    });
    ed.container.appendChild(t);
    ta = t;
    if (coarsePointer) {
      doneBtn = document.createElement('button');
      doneBtn.type = 'button';
      doneBtn.className = 'text-done';
      doneBtn.textContent = 'Done';
      // Keep focus in the textarea until the button is actually pressed.
      doneBtn.addEventListener('pointerdown', (e) => e.preventDefault());
      doneBtn.addEventListener('click', () => finish());
      ed.container.appendChild(doneBtn);
    }
    autosize();
    openedAt = Date.now();
    t.addEventListener('input', autosize);
    t.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        finish();
      }
    });
    t.addEventListener('blur', () => {
      // The click that opened the editor may briefly steal focus.
      if (Date.now() - openedAt < 200) setTimeout(() => ta?.focus(), 0);
      else finish();
    });
    t.focus();
    setTimeout(() => {
      if (ta !== t) return;
      t.focus();
      t.select();
    }, 0);
  }

  function finish() {
    if (!ta || !node) return;
    const t = ta, n = node;
    ta = null;
    node = null;
    const value = t.value.replace(/\s+$/, '');
    t.remove();
    doneBtn?.remove();
    doneBtn = null;
    if (!value.trim()) {
      n.destroy();
      if (before) ed.commit(); // an existing text was emptied → deleted
    } else {
      n.text(value);
      n.visible(true);
      if (value !== before) ed.commit();
      if (ed.toolName === 'select' || ed.toolName === 'text') ed.select([n]);
    }
    ed.annoLayer.batchDraw();
    ed.changed();
  }

  return {
    cursor: 'text',
    hint: 'Click to add text, or click existing text to edit · Ctrl+Enter, Esc or click outside to finish',
    edit,
    finish,
    deactivate: finish,
    touchHint: 'Tap to add text, or tap existing text to edit · tap Done when finished',
    abortPress() {
      pending = null;
    },
    down(p, e) {
      if (ta) {
        finish(); // clicking outside only finishes the current text
        return;
      }
      pending = { p, hit: ed.topNode(e.target) };
    },
    up() {
      if (!pending) return;
      const { p, hit } = pending;
      pending = null;
      if (hit instanceof Konva.Text) {
        edit(hit);
        return;
      }
      const n = makeText(p, ed.style.state);
      ed.add(n);
      edit(n);
    },
  };
}
