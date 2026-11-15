import Konva from 'konva';
import { coarsePointer, type Editor } from './editor';
import { kindOf, type Vec } from './shapes';

/** A draggable point on an annotation, in the annotation's own coordinates. */
interface Point {
  get(): Vec;
  set(v: Vec): void;
  /** Called on release (e.g. to straighten a nearly straight arrow). */
  done?(): void;
  style?: 'end' | 'bend';
}

/**
 * Round handles for the points of a single selected arrow or line (both ends,
 * plus a middle one to bend it) or callout (the tip of the tail).
 */
export class PointHandles {
  private nodes: Konva.Circle[] = [];
  private target: Konva.Node | null = null;
  private points: Point[] = [];

  constructor(private ed: Editor) {}

  /** Does this kind of annotation get point handles instead of resize handles? */
  static replacesTransformer(n: Konva.Node) {
    const k = kindOf(n);
    return k === 'arrow' || k === 'line';
  }

  /** Re-read the selection and put the handles where they belong. */
  sync() {
    const sel = this.ed.selected();
    const n = sel.length === 1 ? sel[0] : null;
    const pts = n ? pointsOf(n, this.ed) : [];
    if (n !== this.target || pts.length !== this.points.length) this.rebuild(n, pts);
    this.place();
  }

  private rebuild(n: Konva.Node | null, pts: Point[]) {
    this.nodes.forEach((c) => c.destroy());
    this.nodes = [];
    this.target = n;
    this.points = pts;
    if (!n) return;
    const r = coarsePointer ? 13 : 7;
    pts.forEach((pt, i) => {
      const c = new Konva.Circle({
        radius: r,
        fill: pt.style === 'bend' ? '#1e88e5' : '#ffffff',
        stroke: '#1e88e5',
        strokeWidth: 2,
        hitStrokeWidth: coarsePointer ? 20 : 8,
        draggable: true,
        name: 'point-handle',
      });
      c.on('mousedown touchstart pointerdown', (e) => (e.cancelBubble = true));
      c.on('dragmove', () => {
        const local = n.getTransform().copy().invert().point(c.position());
        this.points[i].set(local);
        this.ed.annoLayer.batchDraw();
        this.ed.transformer.forceUpdate();
        this.place(c);
      });
      c.on('dragend', () => {
        this.points[i].done?.();
        this.ed.commit([n]);
        this.sync();
      });
      this.ed.uiLayer.add(c);
      this.nodes.push(c);
    });
  }

  /** Position (and keep a constant on-screen size for) every handle except `skip`. */
  private place(skip?: Konva.Circle) {
    const n = this.target;
    if (!n) return;
    const m = n.getTransform();
    const s = 1 / this.ed.scale;
    this.nodes.forEach((c, i) => {
      c.scale({ x: s, y: s });
      if (c !== skip) c.position(m.point(this.points[i].get()));
      c.visible(this.ed.toolName === 'select');
    });
    this.ed.uiLayer.batchDraw();
  }
}

function pointsOf(n: Konva.Node, ed: Editor): Point[] {
  const kind = kindOf(n);
  if (kind === 'callout') {
    return [{ get: () => n.getAttr('tail') ?? { x: 0, y: 0 }, set: (v) => n.setAttr('tail', v) }];
  }
  if (kind !== 'arrow' && kind !== 'line') return [];
  const l = n as Konva.Line;
  const pts = () => l.points();
  const last = () => pts().length - 2;
  const at = (i: number): Vec => ({ x: pts()[i], y: pts()[i + 1] });
  const write = (i: number, v: Vec) => {
    const p = pts().slice();
    p[i] = v.x;
    p[i + 1] = v.y;
    l.points(p);
  };
  return [
    { get: () => at(0), set: (v) => write(0, v), style: 'end' },
    {
      // Middle point: dragging it bends the line into a curve through it.
      get: () => {
        if (pts().length >= 6) return at(2);
        const a = at(0), b = at(last());
        return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      },
      set: (v) => {
        const a = at(0), b = at(last());
        l.points([a.x, a.y, v.x, v.y, b.x, b.y]);
        l.tension(0.5);
      },
      done: () => {
        // Barely bent: snap back to a straight line.
        if (pts().length < 6) return;
        const a = at(0), m = at(2), b = at(4);
        const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        const off = Math.abs((b.x - a.x) * (a.y - m.y) - (a.x - m.x) * (b.y - a.y)) / len;
        if (off * ed.scale < 8) {
          l.points([a.x, a.y, b.x, b.y]);
          l.tension(0);
        }
      },
      style: 'bend',
    },
    { get: () => at(last()), set: (v) => write(last(), v), style: 'end' },
  ];
}
