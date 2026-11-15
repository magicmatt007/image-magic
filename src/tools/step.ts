import type { Editor } from '../editor';
import { makeStep } from '../shapes';
import type { Tool } from './types';

export function stepTool(ed: Editor): Tool {
  return {
    cursor: 'copy',
    hint: 'Click to place numbered steps (1, 2, 3 …)',
    down(p) {
      ed.select([]);
      const n = makeStep(p, ed.style.state, ed.nextStepNumber());
      ed.add(n);
      ed.commit();
      ed.select([n]);
    },
  };
}
