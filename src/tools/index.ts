import type { Editor } from '../editor';
import { cropTool, type CropTool } from './crop';
import { arrowTool, blurTool, ellipseTool, highlightTool, lineTool, rectTool } from './drag';
import { penTool } from './pen';
import { selectTool } from './select';
import { stepTool } from './step';
import { textTool, type TextTool } from './text';
import type { Tool } from './types';

export type ToolName =
  | 'select'
  | 'arrow'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'pen'
  | 'text'
  | 'highlight'
  | 'step'
  | 'blur'
  | 'crop';

export type Tools = Record<Exclude<ToolName, 'text' | 'crop'>, Tool> & { text: TextTool; crop: CropTool };

export function createTools(ed: Editor): Tools {
  return {
    select: selectTool(ed),
    arrow: arrowTool(ed),
    line: lineTool(ed),
    rect: rectTool(ed),
    ellipse: ellipseTool(ed),
    pen: penTool(ed),
    text: textTool(ed),
    highlight: highlightTool(ed),
    step: stepTool(ed),
    blur: blurTool(ed),
    crop: cropTool(ed),
  };
}
