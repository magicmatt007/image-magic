import type { Editor } from '../editor';
import { folderSupported, type FileEntry, type FileSession } from '../files';
import { icon } from './icons';

const STORAGE_KEY = 'image-magic.panel';
const thumbCache = new Map<string, Promise<string>>();
/** Finished thumbnails, so re-renders show them immediately (no flicker). */
const thumbReady = new Map<string, string>();
const thumbKey = (e: FileEntry) => `${e.name}|${e.modified}`;

async function makeThumb(e: FileEntry): Promise<string> {
  const file = await e.handle.getFile();
  const bmp = await createImageBitmap(file, { resizeHeight: 120, resizeQuality: 'medium' });
  const c = document.createElement('canvas');
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext('2d')!.drawImage(bmp, 0, 0);
  bmp.close();
  return c.toDataURL('image/jpeg', 0.8);
}

function thumbFor(e: FileEntry) {
  const key = thumbKey(e);
  let p = thumbCache.get(key);
  if (!p) {
    p = makeThumb(e)
      .then((src) => (thumbReady.set(key, src), src))
      .catch(() => '');
    thumbCache.set(key, p);
  }
  return p;
}

function ago(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString();
}

/** Side panel listing the images of the opened folder. */
export function buildFilePanel(panel: HTMLElement, ed: Editor, files: FileSession) {
  let open = false;
  try {
    open = localStorage.getItem(STORAGE_KEY) === 'open';
  } catch {
    /* ignore */
  }

  const io = new IntersectionObserver(
    (items) => {
      for (const it of items) {
        if (!it.isIntersecting) continue;
        const img = it.target as HTMLImageElement & { entry?: FileEntry };
        io.unobserve(img);
        if (img.entry) thumbFor(img.entry).then((src) => src && (img.src = src));
      }
    },
    { root: panel, rootMargin: '200px' },
  );

  function setOpen(v: boolean) {
    open = v;
    panel.hidden = !open;
    document.body.classList.toggle('panel-open', open);
    try {
      localStorage.setItem(STORAGE_KEY, open ? 'open' : 'closed');
    } catch {
      /* ignore */
    }
    ed.changed();
  }

  function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', text = '') {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function iconButton(name: string, title: string, fn: () => void) {
    const b = el('button', 'icon-btn');
    b.type = 'button';
    b.title = title;
    b.setAttribute('aria-label', title);
    b.innerHTML = icon(name);
    b.addEventListener('click', fn);
    return b;
  }

  function render() {
    panel.replaceChildren();
    const head = el('div', 'panel-head');
    const title = el('div', 'panel-title', files.dir ? files.dir.name : 'Folder');
    title.title = files.dir ? `Folder: ${files.dir.name}` : '';
    head.append(title);
    if (files.dir) {
      head.append(
        iconButton('refresh', 'Refresh list', () => files.refresh()),
        iconButton('folder', 'Open another folder', () => files.pickFolder()),
      );
    }
    head.append(iconButton('close', 'Hide panel', () => setOpen(false)));
    panel.append(head);

    if (!folderSupported) {
      panel.append(
        el('p', 'panel-note', 'Browsing folders needs Chrome, Edge or another Chromium-based browser.'),
      );
      return;
    }

    if (!files.dir) {
      const box = el('div', 'panel-empty');
      box.append(el('p', '', 'Open a folder to flip through its images, for example your screenshots folder.'));
      const openBtn = el('button', 'primary', 'Open folder…');
      openBtn.type = 'button';
      openBtn.addEventListener('click', () => files.pickFolder());
      box.append(openBtn);
      if (files.pendingDir) {
        const again = el('button', '', `Reopen “${files.pendingDir.name}”`);
        again.type = 'button';
        again.addEventListener('click', () => files.reconnect());
        box.append(again);
      }
      panel.append(box);
      return;
    }

    if (!files.entries.length) {
      panel.append(el('p', 'panel-note', 'No images in this folder.'));
      return;
    }

    const list = el('ul', 'file-list');
    const current = files.currentIndex();
    files.entries.forEach((e, i) => {
      const li = el('li');
      const b = el('button', 'file-item');
      b.type = 'button';
      b.title = e.name;
      if (i === current) {
        b.classList.add('current');
        b.setAttribute('aria-current', 'true');
      }
      const img = el('img') as HTMLImageElement & { entry?: FileEntry };
      img.alt = '';
      img.entry = e;
      const ready = thumbReady.get(thumbKey(e));
      if (ready) img.src = ready;
      else io.observe(img);
      const meta = el('span', 'file-meta');
      const name = el('span', 'file-name', e.name);
      if (i === current && ed.dirty) name.prepend(el('span', 'dirty-dot', '●'));
      meta.append(name, el('span', 'file-time', ago(e.modified)));
      b.append(img, meta);
      b.addEventListener('click', () => files.openHandle(e.handle));
      li.append(b);
      list.append(li);
    });
    panel.append(list);
    list.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  }

  // Re-render on file changes; on editor changes only the dirty marker matters.
  let lastDirty = false;
  files.onChange(() => {
    lastDirty = ed.dirty;
    if (open) render();
  });
  ed.onChange(() => {
    if (ed.dirty !== lastDirty) {
      lastDirty = ed.dirty;
      if (open) render();
    }
  });

  // New screenshots may have arrived while the app was in the background.
  window.addEventListener('focus', () => {
    if (open && files.dir) files.refresh();
  });

  setOpen(open);
  render();

  return {
    get open() {
      return open;
    },
    toggle() {
      setOpen(!open);
      if (open) {
        render();
        if (files.dir) files.refresh();
      }
    },
  };
}
