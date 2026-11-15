export interface StyleState {
  color: string;
  strokeWidth: number;
  fontSize: number;
  /** Rect/ellipse: filled. Text: contrasting outline for readability. */
  fill: boolean;
  /** Lines, arrows and shapes: dashed outline. */
  dashed: boolean;
  /** Arrows: a head at both ends. */
  bothEnds: boolean;
}

export type StyleKey = keyof StyleState;

export const PALETTE = [
  '#e5243b', // red
  '#f28c28', // orange
  '#f7d038', // yellow
  '#2bb24c', // green
  '#1e88e5', // blue
  '#8e44ad', // purple
  '#111111', // black
  '#ffffff', // white
];

const DEFAULTS: StyleState = { color: '#e5243b', strokeWidth: 4, fontSize: 28, fill: false, dashed: false, bothEnds: false };
const STORAGE_KEY = 'image-magic.style';

/** Current drawing style, remembered between visits. */
export class Style {
  state: StyleState;
  private listeners = new Set<(key: StyleKey | null) => void>();

  constructor() {
    let saved: Partial<StyleState> = {};
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      /* storage unavailable */
    }
    this.state = { ...DEFAULTS, ...saved };
  }

  /** A user change: listeners apply it to the selection. */
  set<K extends StyleKey>(key: K, value: StyleState[K]) {
    this.state[key] = value;
    this.persist();
    this.listeners.forEach((l) => l(key));
  }

  /** Sync from a selected shape without applying anything back. */
  load(partial: Partial<StyleState>) {
    Object.assign(this.state, partial);
    this.listeners.forEach((l) => l(null));
  }

  onChange(fn: (key: StyleKey | null) => void) {
    this.listeners.add(fn);
  }

  private persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      /* ignore */
    }
  }
}

/** Black or white, whichever reads better on the given colour. */
export function contrastOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return '#ffffff';
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.6 ? '#111111' : '#ffffff';
}
