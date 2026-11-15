import Konva from 'konva';
import { coarsePointer, type Editor } from '../editor';
import type { Vec } from '../shapes';
import type { Tool } from './types';

/**
 * Colour picker: press on the picture, see the colour under the pointer in a
 * small preview, release to take it. Then the previous tool comes back.
 * Anything selected before picking gets the colour too.
 */
export function pickTool(ed: Editor): Tool {
  let preview: Konva.Group | null = null;
  let pressed = false;

  const showPreview = (p: Vec) => {
    const color = ed.colorAt(p);
    if (!preview) {
      preview = new Konva.Group({ listening: false });
      preview.add(new Konva.Circle({ radius: 22, stroke: '#ffffff', strokeWidth: 4, shadowColor: '#000', shadowBlur: 6, shadowOpacity: 0.5 }));
      ed.uiLayer.add(preview);
    }
    // On touch screens, keep the preview clear of the finger.
    const lift = (coarsePointer ? 56 : 30) / ed.scale;
    preview.setAttrs({ x: p.x, y: p.y - lift, scaleX: 1 / ed.scale, scaleY: 1 / ed.scale });
    const c = preview.findOne<Konva.Circle>('Circle')!;
    c.fill(color ?? 'rgba(0,0,0,0)');
    c.visible(true);
    ed.uiLayer.batchDraw();
  };

  const clear = () => {
    preview?.destroy();
    preview = null;
    pressed = false;
    ed.uiLayer.batchDraw();
  };

  return {
    cursor: 'crosshair',
    hint: 'Click the picture to pick a colour · Esc cancels',
    touchHint: 'Touch the picture and slide to the colour you want, then lift',
    deactivate: clear,
    abortPress: clear,
    down(p) {
      pressed = true;
      showPreview(p);
    },
    move(p) {
      if (pressed || !coarsePointer) showPreview(p);
    },
    up(p) {
      if (!pressed) return;
      const color = ed.colorAt(p);
      clear();
      if (color) ed.style.set('color', color);
      ed.setTool(ed.previousTool);
    },
    key(e) {
      if (e.key !== 'Escape') return false;
      ed.setTool(ed.previousTool);
      return true;
    },
  };
}
