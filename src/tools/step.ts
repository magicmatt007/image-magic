import { coarsePointer, type Editor } from '../editor';
import { makeStep } from '../shapes';
import type { Tool } from './types';

export function stepTool(ed: Editor): Tool {
  // Placed on release, so the start of a two-finger pinch doesn't add a badge.
  let pending = false;
  return {
    cursor: 'copy',
    hint: 'Click to place numbered steps (1, 2, 3 …)',
    touchHint: 'Tap to place numbered steps (1, 2, 3 …)',
    abortPress() {
      pending = false;
    },
    down() {
      pending = true;
    },
    up(p) {
      if (!pending) return;
      pending = false;
      ed.select([]);
      const n = makeStep(p, ed.style.state, ed.nextStepNumber());
      ed.add(n);
      ed.commit([n]);
      // On touch screens the big selection handles would catch the next tap.
      if (!coarsePointer) ed.select([n]);
    },
  };
}
