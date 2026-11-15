declare const __APP_VERSION__: string;
declare const __APP_COMMIT__: string;
declare const __APP_BUILT__: string;

export const VERSION = __APP_VERSION__;
export const COMMIT = __APP_COMMIT__;
export const BUILT = new Date(__APP_BUILT__);

/** e.g. "v0.2.0 · e8394f4 · 15 Nov 2026 14:05" */
export function versionLabel() {
  const when = BUILT.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  return `v${VERSION} · ${COMMIT} · ${when}`;
}
