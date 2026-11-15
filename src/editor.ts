import Konva from 'konva';
import { History, type Snapshot } from './history';
import { Style, type StyleKey } from './style';
import { applyStyle, kindOf, readStyle, reviveNode, type Vec } from './shapes';
import { cropCanvas, flipCanvas, pixelateCanvas, resizeCanvas, rotateCanvas } from './imageOps';
import { createTools, type ToolName, type Tools } from './tools';

/**
 * Owns the Konva stage. Content coordinates equal image pixels; zoom and pan
 * live on the stage transform, so exports are always at full resolution.
 */
export class Editor {
  readonly container: HTMLDivElement;
  readonly stage: Konva.Stage;
  readonly imageLayer = new Konva.Layer({ listening: false });
  readonly annoLayer = new Konva.Layer();
  readonly uiLayer = new Konva.Layer();
  readonly imageNode = new Konva.Image({
    image: undefined,
    shadowColor: '#000',
    shadowBlur: 18,
    shadowOpacity: 0.3,
  });
  readonly transformer: Konva.Transformer;
  readonly history: History;
  readonly style = new Style();
  readonly tools: Tools;

  base: HTMLCanvasElement | null = null;
  fileName = 'image';
  toolName: ToolName = 'arrow';
  panning = false;
  /** Keep the image fitted when the window resizes, until the user zooms or pans. */
  private autoFit = true;

  private drawing = false;
  private pixCache = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
  private listeners = new Set<() => void>();
  private dragOrigin = new Map<Konva.Node, Vec>();
  private commitTimer = 0;

  constructor(container: HTMLDivElement) {
    this.container = container;
    this.stage = new Konva.Stage({ container, width: container.clientWidth, height: container.clientHeight });
    this.imageLayer.add(this.imageNode);
    this.transformer = new Konva.Transformer({
      ignoreStroke: true,
      flipEnabled: false,
      padding: 4,
      anchorSize: 9,
      anchorCornerRadius: 2,
      anchorStroke: '#1e88e5',
      borderStroke: '#1e88e5',
      rotateAnchorOffset: 28,
    });
    this.uiLayer.add(this.transformer);
    this.stage.add(this.imageLayer, this.annoLayer, this.uiLayer);
    this.history = new History(this);
    this.tools = createTools(this);
    this.bindEvents();
    this.applyCursor();
    new ResizeObserver(() => {
      this.stage.size({ width: container.clientWidth, height: container.clientHeight });
      if (this.autoFit) this.fit();
    }).observe(container);
  }

  // ---------------------------------------------------------------- events

  onChange(fn: () => void) {
    this.listeners.add(fn);
  }

  changed() {
    this.listeners.forEach((l) => l());
  }

  /** Record the current state for undo. */
  commit() {
    clearTimeout(this.commitTimer);
    this.commitTimer = 0;
    this.history.push();
    this.changed();
  }

  /** Debounced commit, for sliders and other rapid changes. */
  commitSoon() {
    clearTimeout(this.commitTimer);
    this.commitTimer = window.setTimeout(() => this.commit(), 400);
  }

  private flushCommit() {
    if (this.commitTimer) this.commit();
  }

  pointer(): Vec {
    return this.annoLayer.getRelativePointerPosition() ?? { x: 0, y: 0 };
  }

  private bindEvents() {
    const st = this.stage;
    st.on('pointerdown', (e) => {
      if (!this.base || this.panning || e.evt.button !== 0) return;
      if (e.target.getLayer() === this.uiLayer) return; // transformer / crop handles
      this.drawing = true;
      this.tool.down?.(this.pointer(), e);
    });
    st.on('pointermove', (e) => {
      if (!this.base || this.panning) return;
      this.tool.move?.(this.pointer(), e);
    });
    window.addEventListener('pointerup', (e) => {
      if (!this.drawing) return;
      this.drawing = false;
      this.tool.up?.(this.pointer(), e);
    });
    st.on('dblclick dbltap', (e) => {
      const n = this.topNode(e.target);
      if (n instanceof Konva.Text && this.toolName !== 'text') this.tools.text.edit(n);
    });
    st.on('wheel', (e) => {
      e.evt.preventDefault();
      if (!this.base) return;
      const ev = e.evt;
      this.tools.text.finish();
      if (ev.ctrlKey || ev.metaKey) {
        const factor = Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.0025));
        this.zoomAt(this.scale * factor, st.getPointerPosition() ?? this.center());
      } else {
        const k = ev.deltaMode === 1 ? 20 : 1;
        const dx = ev.shiftKey && !ev.deltaX ? ev.deltaY : ev.deltaX;
        const dy = ev.shiftKey && !ev.deltaX ? 0 : ev.deltaY;
        st.position({ x: st.x() - dx * k, y: st.y() - dy * k });
        this.autoFit = false;
        this.changed();
      }
    });
    st.on('dragmove', (e) => {
      if (e.target !== st) return; // stage pan only
      this.autoFit = false;
      this.changed();
    });

    // Moving several selected annotations together.
    this.annoLayer.on('dragstart', (e) => {
      const t = e.target;
      if (!this.selected().includes(t)) this.select([t]);
      this.dragOrigin.clear();
      for (const n of this.selected()) this.dragOrigin.set(n, n.position());
    });
    this.annoLayer.on('dragmove', (e) => {
      const t = e.target;
      const o = this.dragOrigin.get(t);
      if (!o) return;
      const dx = t.x() - o.x, dy = t.y() - o.y;
      for (const [n, p] of this.dragOrigin) if (n !== t) n.position({ x: p.x + dx, y: p.y + dy });
    });
    this.annoLayer.on('dragend', () => {
      this.dragOrigin.clear();
      this.commit();
    });
    this.transformer.on('transformend', () => this.commit());
  }

  /** The annotation (direct child of the annotation layer) that contains `n`. */
  topNode(n: Konva.Node | null): Konva.Node | null {
    while (n && n.getParent() !== this.annoLayer) n = n.getParent();
    return n;
  }

  // ----------------------------------------------------------------- tools

  get tool() {
    return this.tools[this.toolName];
  }

  setTool(name: ToolName) {
    if (name === this.toolName) return;
    this.tool.deactivate?.();
    this.toolName = name;
    if (name !== 'select') this.select([]);
    this.updateDraggable();
    this.applyCursor();
    this.tool.activate?.();
    this.changed();
  }

  setPanning(on: boolean) {
    if (this.panning === on) return;
    this.panning = on;
    this.stage.draggable(on);
    this.updateDraggable();
    this.applyCursor();
  }

  private applyCursor() {
    this.container.style.cursor = this.panning ? 'grab' : this.tool.cursor;
  }

  updateDraggable() {
    const d = this.toolName === 'select' && !this.panning;
    this.annoLayer.getChildren().forEach((n) => n.draggable(d));
  }

  nextStepNumber() {
    let max = 0;
    this.annoLayer.find('.step').forEach((n) => (max = Math.max(max, Number(n.getAttr('stepNumber')) || 0)));
    return max + 1;
  }

  /** Add a freshly drawn annotation. */
  add(node: Konva.Group | Konva.Shape) {
    node.draggable(this.toolName === 'select');
    this.annoLayer.add(node);
  }

  // ------------------------------------------------------------- selection

  selected(): Konva.Node[] {
    return this.transformer.nodes();
  }

  select(nodes: Konva.Node[]) {
    this.transformer.nodes(nodes);
    const textLike = nodes.length > 0 && nodes.every((n) => kindOf(n) === 'text' || kindOf(n) === 'step');
    this.transformer.enabledAnchors(
      textLike
        ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
        : ['top-left', 'top-center', 'top-right', 'middle-right', 'middle-left', 'bottom-left', 'bottom-center', 'bottom-right'],
    );
    this.transformer.keepRatio(textLike);
    if (nodes.length === 1) this.style.load(readStyle(nodes[0]));
    this.uiLayer.batchDraw();
    this.changed();
  }

  applyStyleToSelection(key: StyleKey) {
    const sel = this.selected();
    if (!sel.length) return;
    sel.forEach((n) => applyStyle(n, key, this.style.state));
    this.transformer.forceUpdate();
    this.annoLayer.batchDraw();
    this.commitSoon();
  }

  deleteSelected() {
    const sel = this.selected();
    if (!sel.length) return;
    sel.forEach((n) => n.destroy());
    this.select([]);
    this.commit();
  }

  duplicateSelected() {
    const sel = this.selected();
    if (!sel.length) return;
    const offset = 16 / this.scale;
    const clones = sel.map((n) => {
      const c = n.clone({ x: n.x() + offset, y: n.y() + offset }) as Konva.Shape;
      reviveNode(this, c);
      this.annoLayer.add(c);
      return c;
    });
    this.select(clones);
    this.commit();
  }

  reorderSelected(toFront: boolean) {
    const sel = this.selected();
    if (!sel.length) return;
    sel.forEach((n) => (toFront ? n.moveToTop() : n.moveToBottom()));
    this.commit();
  }

  // ----------------------------------------------------------------- image

  get width() {
    return this.base?.width ?? 0;
  }

  get height() {
    return this.base?.height ?? 0;
  }

  /** Start editing a new picture. Undo history starts fresh and it counts as saved. */
  loadImage(canvas: HTMLCanvasElement, name?: string) {
    this.tools.text.finish();
    clearTimeout(this.commitTimer);
    this.commitTimer = 0;
    if (this.toolName === 'crop') this.setTool('select');
    this.select([]);
    this.annoLayer.destroyChildren();
    this.setBase(canvas);
    this.fileName = name?.replace(/\.[^.]+$/, '') || 'image';
    this.fit();
    this.history.reset();
    this.history.push();
    this.markSaved();
  }

  private savedId = 0;

  /** True when there are edits since the image was opened or last saved. */
  get dirty() {
    return !!this.base && this.history.currentId !== this.savedId;
  }

  /** Commit pending text edits and debounced changes (call before save/switch). */
  settle() {
    this.tools.text.finish();
    this.flushCommit();
  }

  markSaved() {
    this.savedId = this.history.currentId;
    this.changed();
  }

  private setBase(c: HTMLCanvasElement) {
    this.base = c;
    this.imageNode.image(c);
    this.imageNode.size({ width: c.width, height: c.height });
    this.imageLayer.batchDraw();
    this.annoLayer.batchDraw();
    this.changed();
  }

  getPixelated(): HTMLCanvasElement | null {
    if (!this.base) return null;
    let p = this.pixCache.get(this.base);
    if (!p) {
      p = pixelateCanvas(this.base);
      this.pixCache.set(this.base, p);
    }
    return p;
  }

  /**
   * Replace the base image and move annotations along with it.
   * `upright` keeps text and step badges unrotated/unmirrored (only moved).
   */
  private transformImage(next: HTMLCanvasElement, m: Konva.Transform, upright: boolean) {
    for (const n of this.annoLayer.getChildren()) {
      const kind = kindOf(n);
      if (upright && (kind === 'text' || kind === 'step')) {
        const r = n.getClientRect({ relativeTo: this.annoLayer });
        const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 };
        const nc = m.point(c);
        n.position({ x: n.x() + nc.x - c.x, y: n.y() + nc.y - c.y });
      } else {
        n.setAttrs(m.copy().multiply(n.getTransform()).decompose());
      }
    }
    this.setBase(next);
    this.select([]);
    this.fit();
    this.commit();
  }

  private beforeImageOp() {
    this.tools.text.finish();
    this.flushCommit();
    if (this.toolName === 'crop') this.setTool('select');
    return !!this.base;
  }

  rotate(clockwise: boolean) {
    if (!this.beforeImageOp()) return;
    const { width: w, height: h } = this;
    const m = clockwise
      ? new Konva.Transform().translate(h, 0).rotate(Math.PI / 2)
      : new Konva.Transform().translate(0, w).rotate(-Math.PI / 2);
    this.transformImage(rotateCanvas(this.base!, clockwise), m, true);
  }

  flip(horizontal: boolean) {
    if (!this.beforeImageOp()) return;
    const m = horizontal
      ? new Konva.Transform().translate(this.width, 0).scale(-1, 1)
      : new Konva.Transform().translate(0, this.height).scale(1, -1);
    this.transformImage(flipCanvas(this.base!, horizontal), m, true);
  }

  crop(r: { x: number; y: number; width: number; height: number }) {
    if (!this.beforeImageOp()) return;
    const x = Math.max(0, Math.round(r.x)), y = Math.max(0, Math.round(r.y));
    const width = Math.min(this.width - x, Math.round(r.width));
    const height = Math.min(this.height - y, Math.round(r.height));
    if (width < 1 || height < 1) return;
    this.transformImage(cropCanvas(this.base!, { x, y, width, height }), new Konva.Transform().translate(-x, -y), false);
  }

  resize(w: number, h: number) {
    if (!this.beforeImageOp()) return;
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    if (w === this.width && h === this.height) return;
    const m = new Konva.Transform().scale(w / this.width, h / this.height);
    this.transformImage(resizeCanvas(this.base!, w, h), m, false);
  }

  // ------------------------------------------------------------ undo state

  snapshot(): Omit<Snapshot, 'id'> {
    return { base: this.base, anno: JSON.stringify(this.annoLayer.getChildren().map((n) => n.toObject())) };
  }

  restore(s: Snapshot) {
    this.tools.text.finish();
    if (this.toolName === 'crop') this.setTool('select');
    const sizeChanged = !this.base || !s.base || this.base.width !== s.base.width || this.base.height !== s.base.height;
    this.select([]);
    this.annoLayer.destroyChildren();
    for (const obj of JSON.parse(s.anno)) {
      const n = Konva.Node.create(obj) as Konva.Shape;
      reviveNode(this, n);
      this.annoLayer.add(n);
    }
    if (s.base) this.setBase(s.base);
    this.updateDraggable();
    if (sizeChanged) this.fit();
    this.annoLayer.batchDraw();
    this.changed();
  }

  undo() {
    this.tools.text.finish();
    this.flushCommit();
    this.history.undo();
  }

  redo() {
    this.tools.text.finish();
    this.flushCommit();
    this.history.redo();
  }

  // ------------------------------------------------------------------ view

  get scale() {
    return this.stage.scaleX();
  }

  center(): Vec {
    return { x: this.stage.width() / 2, y: this.stage.height() / 2 };
  }

  zoomAt(scale: number, at: Vec) {
    const s = Math.min(16, Math.max(0.05, scale));
    const old = this.scale;
    const pt = { x: (at.x - this.stage.x()) / old, y: (at.y - this.stage.y()) / old };
    this.stage.scale({ x: s, y: s });
    this.stage.position({ x: at.x - pt.x * s, y: at.y - pt.y * s });
    this.autoFit = false;
    this.changed();
  }

  zoomBy(factor: number) {
    this.tools.text.finish();
    this.zoomAt(this.scale * factor, this.center());
  }

  /** Fit the whole image in the window (never enlarging beyond 100%). */
  fit() {
    if (!this.base) return;
    const cw = this.stage.width(), ch = this.stage.height();
    if (!cw || !ch) return;
    const pad = 32;
    const s = Math.max(0.02, Math.min((cw - pad * 2) / this.width, (ch - pad * 2) / this.height, 1));
    this.stage.scale({ x: s, y: s });
    this.stage.position({ x: (cw - this.width * s) / 2, y: (ch - this.height * s) / 2 });
    this.autoFit = true;
    this.changed();
  }

  actualSize() {
    this.zoomAt(1, this.center());
  }

  // ---------------------------------------------------------------- export

  /** The image with all annotations, at original resolution. */
  exportCanvas(): HTMLCanvasElement {
    this.tools.text.finish();
    const st = this.stage;
    const scale = st.scale(), pos = st.position();
    this.uiLayer.visible(false);
    this.imageNode.shadowEnabled(false);
    st.scale({ x: 1, y: 1 });
    st.position({ x: 0, y: 0 });
    const out = st.toCanvas({ x: 0, y: 0, width: this.width, height: this.height, pixelRatio: 1 });
    st.scale(scale);
    st.position(pos);
    this.imageNode.shadowEnabled(true);
    this.uiLayer.visible(true);
    st.batchDraw();
    return out;
  }
}
