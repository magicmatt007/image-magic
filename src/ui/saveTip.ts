const STORAGE_KEY = 'image-magic.saveTip';

/**
 * Explains what happens when the browser may not write files: Save then
 * downloads an "-annotated" copy, and the download location decides where it
 * lands. Shown automatically after the first such save (until "Don't show
 * again"), and on demand from the status bar.
 */
export function setupSaveTip(dialog: HTMLDialogElement) {
  const isEdge = /\bEdg\//.test(navigator.userAgent);
  const settingsUrl = isEdge ? 'edge://settings/downloads' : 'chrome://settings/downloads';
  dialog.querySelectorAll('[data-browser]').forEach((el) => (el.textContent = isEdge ? 'Edge' : 'your browser'));
  const url = dialog.querySelector<HTMLElement>('[data-url]')!;
  url.textContent = settingsUrl;

  dialog.querySelector('[data-copy]')!.addEventListener('click', async (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    try {
      await navigator.clipboard.writeText(settingsUrl);
      btn.textContent = 'Copied';
      setTimeout(() => (btn.textContent = 'Copy'), 1500);
    } catch {
      getSelection()?.selectAllChildren(url);
    }
  });
  dialog.addEventListener('close', () => {
    if (dialog.returnValue !== 'never') return;
    try {
      localStorage.setItem(STORAGE_KEY, 'off');
    } catch {
      /* ignore */
    }
  });

  const show = () => {
    if (dialog.open) return;
    dialog.returnValue = '';
    dialog.showModal();
  };

  let shownThisVisit = false;
  return {
    show,
    afterDownload() {
      let off = false;
      try {
        off = localStorage.getItem(STORAGE_KEY) === 'off';
      } catch {
        /* ignore */
      }
      if (off || shownThisVisit) return;
      shownThisVisit = true;
      show();
    },
  };
}
