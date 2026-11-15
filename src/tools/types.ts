import type Konva from 'konva';
import type { Vec } from '../shapes';

export type PointerEvt = Konva.KonvaEventObject<PointerEvent>;

/** A tool receives pointer positions in image (content) coordinates. */
export interface Tool {
  cursor: string;
  hint: string;
  activate?(): void;
  deactivate?(): void;
  down?(p: Vec, e: PointerEvt): void;
  move?(p: Vec, e: PointerEvt): void;
  up?(p: Vec, e: PointerEvent): void;
  /** Return true when the key was handled. */
  key?(e: KeyboardEvent): boolean;
}
