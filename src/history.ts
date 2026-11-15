import type { Editor } from './editor';

export interface Snapshot {
  /** Base image canvases are never mutated in place, so sharing them is safe. */
  base: HTMLCanvasElement | null;
  /** Serialized annotation nodes (JSON). */
  anno: string;
}

const LIMIT = 100;

export class History {
  private stack: Snapshot[] = [];
  private idx = -1;

  constructor(private ed: Editor) {}

  push() {
    this.stack.length = this.idx + 1;
    this.stack.push(this.ed.snapshot());
    if (this.stack.length > LIMIT) this.stack.shift();
    this.idx = this.stack.length - 1;
  }

  undo() {
    if (!this.canUndo) return;
    this.idx--;
    this.ed.restore(this.stack[this.idx]);
  }

  redo() {
    if (!this.canRedo) return;
    this.idx++;
    this.ed.restore(this.stack[this.idx]);
  }

  get canUndo() {
    return this.idx > 0;
  }

  get canRedo() {
    return this.idx < this.stack.length - 1;
  }
}
