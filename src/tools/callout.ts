import type Konva from 'konva';
import type { Editor } from '../editor';
import { calloutText, makeCallout, type Vec } from '../shapes';
import type { Tool } from './types';

/**
 * Drag from the spot to point at to where the bubble should go, or just tap
 * the spot. Then type the text.
 */
export function calloutTool(ed: Editor): Tool {
  let start: Vec | null = null;
  let node: Konva.Group | null = null;

  /** Bubble beside the end point, vertically centred on it. */
  const place = (g: Konva.Group, tip: Vec, end: Vec) => {
    const t = calloutText(g);
    const h = Math.max(t.height(), t.fontSize() * 1.6);
    const at = { x: end.x, y: end.y - h / 2 };
    g.position(at);
    g.setAttr('tail', { x: tip.x - at.x, y: tip.y - at.y });
  };

  return {
    cursor: 'crosshair',
    hint: 'Drag from the spot to point at to where the text should go, or click the spot · then type',
    touchHint: 'Drag from the spot to point at to where the text should go, or tap it · then type',
    deactivate() {
      ed.tools.text.finish();
    },
    abortPress() {
      node?.destroy();
      node = null;
      start = null;
      ed.annoLayer.batchDraw();
    },
    down(p, e) {
      // Tapping an existing callout edits its text.
      const hit = ed.editableText(ed.topNode(e.target));
      if (hit) {
        ed.tools.text.edit(hit);
        return;
      }
      if (ed.tools.text.editing) {
        ed.tools.text.finish(); // tapping outside only finishes the current text
        return;
      }
      ed.select([]);
      start = p;
    },
    move(p) {
      if (!start) return;
      if (!node) {
        if (Math.hypot(p.x - start.x, p.y - start.y) * ed.scale < 8) return;
        node = makeCallout(ed, start, p, ed.style.state);
        ed.add(node);
      }
      place(node, start, p);
      ed.annoLayer.batchDraw();
    },
    up() {
      if (!start) return;
      const tip = start;
      start = null;
      let g = node;
      node = null;
      if (!g) {
        // A tap: put the bubble up and to the right of the spot.
        const off = 48 / ed.scale;
        g = makeCallout(ed, tip, tip, ed.style.state);
        ed.add(g);
        place(g, tip, { x: tip.x + off, y: tip.y - off });
      }
      ed.annoLayer.batchDraw();
      ed.tools.text.edit(calloutText(g));
    },
  };
}
