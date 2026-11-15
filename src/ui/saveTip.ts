import { toast } from './toast';

const STORAGE_KEY = 'image-magic.saveTip';

/**
 * One-time explanation shown after the first save that had to become a
 * download: how to make the browser ask where to save, so the original file
 * can be replaced. Returns the function to call after such a save.
 */
export function setupSaveTip(dialog: HTMLDialogElement) {
  const isEdge = /\bEdg\//.test(navigator.userAgent);
  const settingsUrl = isEdge ? 'edge://settings/downloads' : 'chrome://settings/downloads';
  const settingName = isEdge
    ? 'Ask me where to save each file before downloading'
    : 'Ask where to save each file before downloading';

  dialog.querySelector('[data-setting]')!.textContent = settingName;
  dialog.querySelector('[data-browser]')!.textContent = isEdge ? 'Edge' : 'the browser';
  const url = dialog.querySelector<HTMLElement>('[data-url]')!;
  url.textContent = settingsUrl;
  dialog.querySelector('[data-copy]')!.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(settingsUrl);
      toast('Copied. Paste it into the address bar');
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

  let shownThisVisit = false;
  return () => {
    let off = false;
    try {
      off = localStorage.getItem(STORAGE_KEY) === 'off';
    } catch {
      /* ignore */
    }
    if (off || shownThisVisit || dialog.open) return;
    shownThisVisit = true;
    dialog.returnValue = '';
    dialog.showModal();
  };
}
