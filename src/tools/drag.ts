import type Konva from 'konva';
import type { Editor } from '../editor';
import {
  boxOf,
  makeArrow,
  makeBlur,
  makeEllipse,
  makeHighlight,
  makeLine,
  makeRect,
  snap45,
  type Vec,
} from '../shapes';
import type { Tool } from './types';

type Shape = Konva.Shape;

/** Generic press-drag-release tool that creates one shape. */
function dragTool(
  ed: Editor,
  hint: string,
  touchHint: string,
  make: (p: Vec) => Shape,
  update: (n: Shape, a: Vec, b: Vec, shift: boolean) => void,
): Tool {
  let node: Shape | null = null;
  let start: Vec = { x: 0, y: 0 };
  return {
    cursor: 'crosshair',
    hint,
    touchHint,
    abortPress() {
      node?.destroy();
      node = null;
      ed.annoLayer.batchDraw();
    },
    down(p) {
      ed.select([]);
      start = p;
      node = make(p);
      ed.add(node);
    },
    move(p, e) {
      if (!node) return;
      update(node, start, p, e.evt.shiftKey);
      ed.annoLayer.batchDraw();
    },
    up(p) {
      if (!node) return;
      const n = node;
      node = null;
      // A plain click (no real drag) creates nothing.
      if (Math.hypot(p.x - start.x, p.y - start.y) * ed.scale < 4) {
        n.destroy();
        ed.annoLayer.batchDraw();
        return;
      }
      ed.commit([n]);
      ed.select([n]);
    },
  };
}

const updateLine = (n: Shape, a: Vec, b: Vec, shift: boolean) => {
  const e = shift ? snap45(a, b) : b;
  (n as Konva.Line).points([a.x, a.y, e.x, e.y]);
};
const updateBox = (n: Shape, a: Vec, b: Vec, shift: boolean) => n.setAttrs(boxOf(a, b, shift));
const updateEllipse = (n: Shape, a: Vec, b: Vec, shift: boolean) => {
  const r = boxOf(a, b, shift);
  n.setAttrs({ x: r.x + r.width / 2, y: r.y + r.height / 2, radiusX: r.width / 2, radiusY: r.height / 2 });
};

export const arrowTool = (ed: Editor) =>
  dragTool(ed, 'Drag to draw an arrow · Shift snaps to 45°', 'Drag to draw an arrow · two fingers zoom and pan', (p) => makeArrow(p, ed.style.state), updateLine);

export const lineTool = (ed: Editor) =>
  dragTool(ed, 'Drag to draw a line · Shift snaps to 45°', 'Drag to draw a line · two fingers zoom and pan', (p) => makeLine(p, ed.style.state), updateLine);

export const rectTool = (ed: Editor) =>
  dragTool(ed, 'Drag to draw a rectangle · Shift for a square', 'Drag to draw a rectangle · two fingers zoom and pan', (p) => makeRect(p, ed.style.state), updateBox);

export const ellipseTool = (ed: Editor) =>
  dragTool(ed, 'Drag to draw an ellipse · Shift for a circle', 'Drag to draw an ellipse · two fingers zoom and pan', (p) => makeEllipse(p, ed.style.state), updateEllipse);

export const highlightTool = (ed: Editor) =>
  dragTool(ed, 'Drag over an area to highlight it', 'Drag over an area to highlight it', (p) => makeHighlight(p, ed.style.state), updateBox);

export const blurTool = (ed: Editor) =>
  dragTool(ed, 'Drag over sensitive content to pixelate it', 'Drag over sensitive content to pixelate it', (p) => makeBlur(ed, p), updateBox);
