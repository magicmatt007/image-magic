import type Konva from 'konva';
import type { Editor } from '../editor';
import { makeLine } from '../shapes';
import type { Tool } from './types';

export function penTool(ed: Editor): Tool {
  let line: Konva.Line | null = null;
  return {
    cursor: 'crosshair',
    hint: 'Draw freehand',
    abortPress() {
      line?.destroy();
      line = null;
      ed.annoLayer.batchDraw();
    },
    down(p) {
      ed.select([]);
      line = makeLine(p, ed.style.state, 'pen');
      line.points([p.x, p.y]);
      ed.add(line);
    },
    move(p) {
      if (!line) return;
      const pts = line.points();
      const lx = pts[pts.length - 2], ly = pts[pts.length - 1];
      if (Math.hypot(p.x - lx, p.y - ly) * ed.scale < 2) return;
      line.points(pts.concat([p.x, p.y]));
      ed.annoLayer.batchDraw();
    },
    up(p) {
      if (!line) return;
      // A single click leaves a dot.
      if (line.points().length === 2) line.points([...line.points(), p.x + 0.01, p.y]);
      const done = line;
      line = null;
      ed.annoLayer.batchDraw();
      ed.commit([done]);
    },
  };
}
