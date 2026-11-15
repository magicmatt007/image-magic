/**
 * Optional platform hooks. The desktop (Tauri) build fills these in; the web
 * build leaves them empty. Kept free of imports so it can be loaded first.
 */
export const platform: {
  /** Running inside the desktop app. */
  desktop: boolean;
  /** Remember the open folder for next start (instead of IndexedDB). */
  rememberDir?: (dir: FileSystemDirectoryHandle) => void;
  /** The folder remembered from last time, if any. */
  restoreDir?: () => FileSystemDirectoryHandle | null;
  /** Put a PNG on the clipboard when the browser API is unavailable. */
  copyImage?: (png: Blob) => Promise<void>;
} = { desktop: false };
