import Konva from 'konva';
import type { Editor } from './editor';
import { contrastOn, type StyleKey, type StyleState } from './style';

export type Vec = { x: number; y: number };

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu, sans-serif';

/** Annotation kinds, stored in each node's `name`. */
export type Kind = 'arrow' | 'line' | 'pen' | 'rect' | 'ellipse' | 'highlight' | 'text' | 'step' | 'blur' | 'image' | 'callout';

export const kindOf = (n: Konva.Node) => n.name() as Kind;

const headSize = (sw: number) => ({ pointerLength: sw * 2.5 + 10, pointerWidth: sw * 2.5 + 10 });
const hitWidth = (sw: number) => Math.max(14, sw + 10);
const textHalo = (s: StyleState) =>
  s.fill
    ? { stroke: contrastOn(s.color), strokeWidth: Math.max(2, s.fontSize / 6), strokeEnabled: true }
    : { strokeEnabled: false };
const stepRadius = (fontSize: number) => fontSize * 0.7 + 4;
/** Dash pattern for a stroke width (round caps make dashes look longer). */
const dashFor = (sw: number) => [sw * 2 + 6, sw * 1.5 + 6];
const lineDash = (s: StyleState) => ({ dash: dashFor(s.strokeWidth), dashEnabled: s.dashed });

export function makeArrow(p: Vec, s: StyleState) {
  return new Konva.Arrow({
    name: 'arrow',
    points: [p.x, p.y, p.x, p.y],
    stroke: s.color,
    fill: s.color,
    strokeWidth: s.strokeWidth,
    hitStrokeWidth: hitWidth(s.strokeWidth),
    lineCap: 'round',
    lineJoin: 'round',
    strokeScaleEnabled: false,
    pointerAtBeginning: s.bothEnds,
    ...lineDash(s),
    ...headSize(s.strokeWidth),
  });
}

export function makeLine(p: Vec, s: StyleState, kind: 'line' | 'pen' = 'line') {
  return new Konva.Line({
    name: kind,
    points: [p.x, p.y, p.x, p.y],
    stroke: s.color,
    strokeWidth: s.strokeWidth,
    hitStrokeWidth: hitWidth(s.strokeWidth),
    lineCap: 'round',
    lineJoin: 'round',
    tension: kind === 'pen' ? 0.35 : 0,
    strokeScaleEnabled: false,
    ...lineDash(s),
  });
}

export function makeRect(p: Vec, s: StyleState) {
  return new Konva.Rect({
    name: 'rect',
    x: p.x,
    y: p.y,
    stroke: s.color,
    strokeWidth: s.strokeWidth,
    fill: s.color,
    fillEnabled: s.fill,
    cornerRadius: 3,
    hitStrokeWidth: hitWidth(s.strokeWidth),
    strokeScaleEnabled: false,
    ...lineDash(s),
  });
}

export function makeEllipse(p: Vec, s: StyleState) {
  return new Konva.Ellipse({
    name: 'ellipse',
    x: p.x,
    y: p.y,
    radiusX: 0,
    radiusY: 0,
    stroke: s.color,
    strokeWidth: s.strokeWidth,
    fill: s.color,
    fillEnabled: s.fill,
    hitStrokeWidth: hitWidth(s.strokeWidth),
    strokeScaleEnabled: false,
    ...lineDash(s),
  });
}

export function makeHighlight(p: Vec, s: StyleState) {
  return new Konva.Rect({ name: 'highlight', x: p.x, y: p.y, fill: s.color, opacity: 0.35, cornerRadius: 2 });
}

export function makeText(p: Vec, s: StyleState) {
  return new Konva.Text({
    name: 'text',
    x: p.x,
    y: p.y - s.fontSize * 0.6,
    text: '',
    fontSize: s.fontSize,
    fontFamily: FONT,
    fontStyle: 'bold',
    lineHeight: 1.2,
    padding: 2,
    fill: s.color,
    lineJoin: 'round',
    fillAfterStrokeEnabled: true,
    ...textHalo(s),
  });
}

export function makeStep(p: Vec, s: StyleState, n: number) {
  const g = new Konva.Group({ name: 'step', x: p.x, y: p.y });
  g.setAttr('stepNumber', n);
  g.add(
    new Konva.Circle({
      name: 'step-circle',
      fill: s.color,
      stroke: '#ffffff',
      shadowColor: '#000000',
      shadowBlur: 4,
      shadowOpacity: 0.35,
      shadowOffset: { x: 0, y: 1 },
    }),
  );
  g.add(
    new Konva.Text({
      name: 'step-text',
      text: String(n),
      fontFamily: FONT,
      fontStyle: 'bold',
      align: 'center',
      verticalAlign: 'middle',
    }),
  );
  sizeStep(g, s.fontSize);
  colorStep(g, s.color);
  return g;
}

function sizeStep(g: Konva.Group, fontSize: number) {
  const r = stepRadius(fontSize);
  const circle = g.findOne<Konva.Circle>('.step-circle')!;
  circle.radius(r);
  circle.strokeWidth(Math.max(2, r / 9));
  const label = g.findOne<Konva.Text>('.step-text')!;
  label.setAttrs({ x: -r, y: -r, width: r * 2, height: r * 2, fontSize: r * 1.05 });
}

function colorStep(g: Konva.Group, color: string) {
  g.findOne<Konva.Circle>('.step-circle')!.fill(color);
  g.findOne<Konva.Text>('.step-text')!.fill(contrastOn(color));
}

/**
 * Speech bubble: a text box with a tail pointing at something. The group sits
 * at the box's top-left corner; the tail tip is the group attribute `tail`, in
 * the group's own coordinates. The box grows with the text.
 */
export function makeCallout(ed: Editor, tip: Vec, at: Vec, s: StyleState) {
  const g = new Konva.Group({ name: 'callout', x: at.x, y: at.y });
  g.setAttr('tail', { x: tip.x - at.x, y: tip.y - at.y });
  g.add(new Konva.Shape({ name: 'callout-bubble', stroke: s.color, strokeWidth: Math.max(2, s.strokeWidth) }));
  g.add(
    new Konva.Text({
      name: 'callout-text',
      text: '',
      fontSize: s.fontSize,
      fontFamily: FONT,
      fontStyle: 'bold',
      lineHeight: 1.25,
    }),
  );
  sizeCallout(g, s.fontSize);
  colorCallout(g, s.color, s.fill);
  reviveNode(ed, g);
  return g;
}

export const calloutText = (g: Konva.Node) => (g as Konva.Group).findOne<Konva.Text>('.callout-text')!;
const calloutBubble = (g: Konva.Node) => (g as Konva.Group).findOne<Konva.Shape>('.callout-bubble')!;

function sizeCallout(g: Konva.Group, fontSize: number) {
  const t = calloutText(g);
  t.fontSize(fontSize);
  t.padding(Math.round(fontSize * 0.45 + 4));
}

/** Outline style: white box, coloured border. Filled: coloured box. */
function colorCallout(g: Konva.Group, color: string, filled: boolean) {
  g.setAttr('filled', filled);
  calloutBubble(g).setAttrs({ stroke: color, fill: filled ? color : '#ffffff' });
  calloutText(g).fill(filled ? contrastOn(color) : '#111111');
}

/** Box size, corner radius and tail of a callout, in the group's coordinates. */
function calloutGeometry(bubble: Konva.Shape) {
  const g = bubble.getParent()!;
  const t = calloutText(g);
  const fs = t.fontSize();
  const w = Math.max(t.width(), fs * 3), h = Math.max(t.height(), fs * 1.6);
  const tail: Vec = g.getAttr('tail') ?? { x: 0, y: 0 };
  const r = Math.min(fs * 0.5, w / 2, h / 2);
  // The tail is a triangle from the box centre to the tip; the box covers its base.
  const c = { x: w / 2, y: h / 2 };
  const dx = tail.x - c.x, dy = tail.y - c.y;
  const len = Math.hypot(dx, dy);
  const inside = Math.abs(dx) <= w / 2 && Math.abs(dy) <= h / 2;
  const half = Math.min(w, h) * 0.22;
  const tri = inside || !len
    ? null
    : [tail, { x: c.x - (dy / len) * half, y: c.y + (dx / len) * half }, { x: c.x + (dy / len) * half, y: c.y - (dx / len) * half }];
  return { w, h, r, tri, tail };
}

type PathCtx = Pick<CanvasRenderingContext2D, 'beginPath' | 'moveTo' | 'lineTo' | 'arcTo' | 'closePath'>;
function roundRectPath(c: PathCtx, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(r, 0);
  c.arcTo(w, 0, w, h, r);
  c.arcTo(w, h, 0, h, r);
  c.arcTo(0, h, 0, 0, r);
  c.arcTo(0, 0, w, 0, r);
  c.closePath();
}
function trianglePath(c: PathCtx, tri: Vec[]) {
  c.beginPath();
  c.moveTo(tri[0].x, tri[0].y);
  c.lineTo(tri[1].x, tri[1].y);
  c.lineTo(tri[2].x, tri[2].y);
  c.closePath();
}

function reviveCallout(g: Konva.Group) {
  const bubble = calloutBubble(g);
  bubble.sceneFunc((ctx, sh) => {
    const { w, h, r, tri } = calloutGeometry(sh);
    const c = (ctx as unknown as { _context: CanvasRenderingContext2D })._context;
    c.save();
    c.lineJoin = 'round';
    c.strokeStyle = sh.stroke() as string;
    c.fillStyle = sh.fill() as string;
    // Stroke everything at double width, then fill on top: only the outer
    // half of the outline stays, and the tail joins the box seamlessly.
    c.lineWidth = sh.strokeWidth() * 2;
    roundRectPath(c, w, h, r);
    c.stroke();
    if (tri) {
      trianglePath(c, tri);
      c.stroke();
    }
    roundRectPath(c, w, h, r);
    c.fill();
    if (tri) {
      trianglePath(c, tri);
      c.fill();
    }
    c.restore();
  });
  bubble.hitFunc((ctx, sh) => {
    const { w, h, r, tri } = calloutGeometry(sh);
    roundRectPath(ctx, w, h, r);
    ctx.fillStrokeShape(sh);
    if (tri) {
      trianglePath(ctx, tri);
      ctx.fillStrokeShape(sh);
    }
  });
  // Bounds for selection, canvas growth and trimming: the box plus the tail.
  bubble.getSelfRect = () => {
    const { w, h, tail } = calloutGeometry(bubble);
    const x0 = Math.min(0, tail.x), y0 = Math.min(0, tail.y);
    return { x: x0, y: y0, width: Math.max(w, tail.x) - x0, height: Math.max(h, tail.y) - y0 };
  };
  bubble.listening(true);
  calloutText(g).listening(false);
}

/**
 * Pixelated region for hiding sensitive content. It draws the editor's
 * pixelated copy of the base image, clipped to its own box, and stays aligned
 * with the image however it is moved, resized or rotated.
 */
export function makeBlur(ed: Editor, p: Vec) {
  const s = new Konva.Shape({ name: 'blur', x: p.x, y: p.y, width: 0, height: 0, fill: '#000' });
  reviveNode(ed, s);
  return s;
}

/** Re-attach behaviour that does not survive serialization (undo/redo, clone). */
export function reviveNode(ed: Editor, node: Konva.Node) {
  if (kindOf(node) === 'image') {
    // Pixels aren't serialized; they live in the editor's image store.
    const img = ed.imageById(node.getAttr('imageId'));
    if (img) (node as Konva.Image).image(img);
    return;
  }
  if (kindOf(node) === 'callout') return reviveCallout(node as Konva.Group);
  if (kindOf(node) !== 'blur') return;
  const shape = node as Konva.Shape;
  shape.sceneFunc((ctx, sh) => {
    const pix = ed.getPixelated();
    if (!pix) return;
    const w = sh.width(), h = sh.height();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    const m = sh.getTransform().copy().invert().getMatrix();
    ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    ctx.drawImage(pix, 0, 0);
    ctx.restore();
  });
  shape.hitFunc((ctx, sh) => {
    ctx.beginPath();
    ctx.rect(0, 0, sh.width(), sh.height());
    ctx.closePath();
    ctx.fillStrokeShape(sh);
  });
}

/** Apply one changed style property to an existing annotation. */
export function applyStyle(node: Konva.Node, key: StyleKey, s: StyleState) {
  const kind = kindOf(node);
  switch (kind) {
    case 'arrow': {
      const a = node as Konva.Arrow;
      if (key === 'color') a.setAttrs({ stroke: s.color, fill: s.color });
      if (key === 'strokeWidth')
        a.setAttrs({
          strokeWidth: s.strokeWidth,
          hitStrokeWidth: hitWidth(s.strokeWidth),
          dash: dashFor(s.strokeWidth),
          ...headSize(s.strokeWidth),
        });
      if (key === 'dashed') a.dashEnabled(s.dashed);
      if (key === 'bothEnds') a.pointerAtBeginning(s.bothEnds);
      break;
    }
    case 'line':
    case 'pen': {
      const l = node as Konva.Line;
      if (key === 'color') l.stroke(s.color);
      if (key === 'strokeWidth')
        l.setAttrs({ strokeWidth: s.strokeWidth, hitStrokeWidth: hitWidth(s.strokeWidth), dash: dashFor(s.strokeWidth) });
      if (key === 'dashed') l.dashEnabled(s.dashed);
      break;
    }
    case 'rect':
    case 'ellipse': {
      const sh = node as Konva.Shape;
      if (key === 'color') sh.setAttrs({ stroke: s.color, fill: s.color });
      if (key === 'strokeWidth')
        sh.setAttrs({ strokeWidth: s.strokeWidth, hitStrokeWidth: hitWidth(s.strokeWidth), dash: dashFor(s.strokeWidth) });
      if (key === 'fill') sh.fillEnabled(s.fill);
      if (key === 'dashed') sh.dashEnabled(s.dashed);
      break;
    }
    case 'callout': {
      const g = node as Konva.Group;
      if (key === 'color' || key === 'fill') colorCallout(g, s.color, s.fill);
      if (key === 'strokeWidth') calloutBubble(g).strokeWidth(Math.max(2, s.strokeWidth));
      if (key === 'fontSize') sizeCallout(g, s.fontSize);
      break;
    }
    case 'highlight':
      if (key === 'color') (node as Konva.Rect).fill(s.color);
      break;
    case 'text': {
      const t = node as Konva.Text;
      if (key === 'color') t.fill(s.color);
      if (key === 'fontSize') t.fontSize(s.fontSize);
      if (key === 'color' || key === 'fill' || key === 'fontSize') t.setAttrs(textHalo(s));
      break;
    }
    case 'step':
      if (key === 'color') colorStep(node as Konva.Group, s.color);
      if (key === 'fontSize') sizeStep(node as Konva.Group, s.fontSize);
      break;
  }
}

/** The style of an annotation, so the style bar can show it when selected. */
export function readStyle(node: Konva.Node): Partial<StyleState> {
  switch (kindOf(node)) {
    case 'arrow': {
      const a = node as Konva.Arrow;
      return { color: a.stroke() as string, strokeWidth: a.strokeWidth(), dashed: a.dashEnabled(), bothEnds: a.pointerAtBeginning() };
    }
    case 'line':
    case 'pen': {
      const l = node as Konva.Line;
      return { color: l.stroke() as string, strokeWidth: l.strokeWidth(), dashed: l.dashEnabled() };
    }
    case 'rect':
    case 'ellipse': {
      const sh = node as Konva.Shape;
      return { color: sh.stroke() as string, strokeWidth: sh.strokeWidth(), fill: sh.fillEnabled(), dashed: sh.dashEnabled() };
    }
    case 'callout': {
      const b = calloutBubble(node);
      return { color: b.stroke() as string, fontSize: calloutText(node).fontSize(), fill: !!node.getAttr('filled') };
    }
    case 'highlight':
      return { color: (node as Konva.Rect).fill() as string };
    case 'text': {
      const t = node as Konva.Text;
      return { color: t.fill() as string, fontSize: t.fontSize(), fill: t.strokeEnabled() };
    }
    case 'step': {
      const c = (node as Konva.Group).findOne<Konva.Circle>('.step-circle')!;
      return { color: c.fill() as string, fontSize: Math.round((c.radius() - 4) / 0.7) };
    }
    default:
      return {};
  }
}

/** Normalized box from two drag points; `square` forces equal sides. */
export function boxOf(a: Vec, b: Vec, square = false) {
  let dx = b.x - a.x, dy = b.y - a.y;
  if (square) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    dx = Math.sign(dx || 1) * m;
    dy = Math.sign(dy || 1) * m;
  }
  return { x: Math.min(a.x, a.x + dx), y: Math.min(a.y, a.y + dy), width: Math.abs(dx), height: Math.abs(dy) };
}

/** End point snapped to 45° steps from the start point. */
export function snap45(a: Vec, b: Vec): Vec {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const step = Math.PI / 4;
  const ang = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / step) * step;
  return { x: a.x + Math.cos(ang) * len, y: a.y + Math.sin(ang) * len };
}
