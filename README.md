# image-magic

**Live app: https://magicmatt007.github.io/image-magic/**

A lightweight image annotator for screenshots and pictures. It runs in any modern browser on Linux, Windows and macOS, and can be installed as a desktop app (PWA) that works offline.

## Features

- **Open an image:** paste with <kbd>Ctrl</kbd>+<kbd>V</kbd>, drag and drop, use the file picker, start from a blank canvas, or use "Open with" from the OS (installed app, Chrome/Edge only).
- **Edit files in place:** Save writes back to the file you opened. Save as writes a copy.
- **Browse a folder:** open a folder (for example your screenshots) and flip through its images in a side panel.
- **Annotate:**
  - arrows, lines, rectangles, ellipses and freehand drawing
  - text
  - see-through highlighter boxes
  - numbered step badges (1, 2, 3 …)
  - pixelate, to hide sensitive content
- **Edit annotations:** select, move, resize and rotate; box-select; duplicate; change stacking order; delete; restyle (colour, width, text size, fill/outline).
- **Change the image:** crop, rotate 90°, flip, and resize. Annotations move with the image.
- **Undo and redo** for everything, including crops, rotations and opening a new image.
- **Output:** copy to the clipboard, or save as PNG or JPEG at the image's original resolution, whatever the zoom level.
- **Light and dark** themes, following the system setting.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| V A L R E P T H N B C | Select, Arrow, Line, Rectangle, Ellipse, Pen, Text, Highlighter, Number step, Blur/pixelate, Crop |
| Ctrl+V / Ctrl+O / Ctrl+Shift+O | Paste image / open file / open folder |
| Ctrl+B | Show or hide the folder panel |
| Page Down / Page Up | Next / previous image in the folder |
| Ctrl+C (or Ctrl+Shift+C) | Copy the annotated image |
| Ctrl+S / Ctrl+Shift+S | Save (over the opened file) / Save as |
| Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y) | Undo / redo |
| Del or Backspace | Delete the selection |
| Ctrl+D / Ctrl+A | Duplicate the selection / select all |
| ] / [ | Bring to front / send to back |
| Shift while drawing | Snap lines to 45°, make squares and circles |
| Ctrl+scroll, Ctrl+= / Ctrl+− | Zoom |
| Ctrl+0 / Ctrl+1 | Fit to window / 100% |
| Scroll, or Space+drag | Pan |
| Enter / Esc (crop) | Apply / cancel the crop |
| Ctrl+Enter or Esc (text) | Finish editing text |

Double-click a text annotation to edit it. With the **Fill / outline** option on, rectangles and ellipses are filled and text gets a contrasting outline.

## Working with files and folders

**Save over the original.** When you open an image from disk (with Open, by dropping a file, from the folder panel, or with "Open with"), **Save** (<kbd>Ctrl</kbd>+<kbd>S</kbd>) writes the annotated image back to that same file, in the same format (PNG, JPEG or WebP). The first time, the browser asks for permission to edit the file. **Save as** (<kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd>) writes a copy under a new name, and you then keep editing that copy. Pasted images have no file yet, so Save asks where to put them.

> Saving flattens the annotations into the picture, so the original version of the file is replaced. Undo works until you switch to another image. Use **Save as** if you want to keep the original.

**Browse a folder.** Click the folder button (or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd>, or drop a folder onto the app) and pick a folder, for example your screenshots folder. The side panel lists its images with thumbnails, newest first (sorted by name, which for screenshots contains the date and time). Click one, or use <kbd>Page Down</kbd>/<kbd>Page Up</kbd>, to move between images. The list refreshes when you come back to the app, so new screenshots show up. If you switch images with unsaved changes, the app asks whether to save them. The app remembers the folder: next time it reopens it straight away, or after one click on **Reopen** if the browser wants to confirm permission again.

These features use the browser's File System Access API, which is available in **Chrome, Edge and other Chromium-based browsers** (including the installed app).

**Basic mode.** Some computers block websites from accessing local folders. On company laptops this is usually a policy set by IT (for example Chrome's `DefaultFileSystemReadGuardSetting` / `DefaultFileSystemWriteGuardSetting`). Firefox and Safari don't support the API at all. In those cases the folder panel explains what happened, shows the technical error, and offers **Choose folder (basic mode)**. That uses the browser's classic folder picker, which always works: you can browse and annotate the folder's images, but the list doesn't refresh by itself. If read access is still allowed, the app opens the folder read-only instead.

**Saving when file editing is blocked.** If the browser isn't allowed to write files (the site info panel shows "File editing: Not allowed"), Save downloads the image **under its original name and format** (`screenshot.png` stays `screenshot.png`, a `.jpg` stays a JPEG). To put it back into the original folder, turn on **Ask me where to save each file before downloading** once, in `edge://settings/downloads` (Edge) or `chrome://settings/downloads` (Chrome). Every Save then opens the save dialog: pick the original folder and confirm replacing the file. The app explains this the first time it happens. The only way to save in place without a dialog is for IT to allow the site for file editing (Edge/Chrome policy `FileSystemWriteAskForUrls`).

## Offline use

image-magic works without an internet connection:

- **First visit:** the first time you open the app (online), a service worker stores all of its files (HTML, JavaScript, CSS and icons, about 270 KB) in the browser's cache.
- **After that:** the app loads from that cache, online or offline. This works in a normal browser tab as well as in the installed desktop app.
- **Your images stay on your computer.** All editing, opening and saving happens locally in the browser. Images are never uploaded anywhere, even when you're online.
- **Updates:** whenever the app is opened online, it checks for a newer version in the background and switches to it automatically (the service worker uses `registerType: 'autoUpdate'`). Offline, you keep using the version you last had.

To check it yourself: open the app once, disconnect from the network, and reload it (or launch the installed app). The offline setup is configured in `vite.config.ts` (vite-plugin-pwa / Workbox) and registered in `src/main.ts`.

## Run it

```bash
npm install
npm run dev        # development server at http://localhost:5173
npm run build      # static site in dist/
npm run preview    # serve the production build at http://localhost:4173
```

Every push to `main` deploys to GitHub Pages via `.github/workflows/deploy.yml`. `dist/` is a plain static site: host it anywhere (GitHub Pages, Netlify, any web server, including in a sub-folder). Copying to the clipboard and installing as an app need HTTPS or `localhost`.

## Install as a desktop app

Open the app in Chrome or Edge and click the install icon in the address bar (or choose **⋮ → Cast, save and share → Install page as app**). It then gets its own window and launcher icon, works offline, and appears in the OS "Open with" menu for image files. Safari on macOS: **File → Add to Dock**. Firefox can't install it, but the app works there in a normal tab.

## Project layout

- `src/editor.ts` sets up the Konva stage, layers, selection, zoom/pan, image operations and export.
- `src/tools/` has one module per tool (`drag.ts` covers the simple press-drag shapes).
- `src/shapes.ts` creates annotation shapes and applies styles to them.
- `src/history.ts` keeps undo/redo snapshots (base image and serialized annotations).
- `src/imageOps.ts` holds the pure canvas operations (rotate, flip, crop, resize, pixelate).
- `src/files.ts` handles file and folder handles: opening, saving in place, Save as, the folder list, the remembered folder, the unsaved-changes prompt, paste, drag and drop, and "Open with".
- `src/io.ts` decodes and encodes images, copies to the clipboard, and downloads files.
- `src/ui/` builds the toolbar, style bar, folder panel (`filePanel.ts`), icons, toasts and CSS.
- `scripts/make-icons.mjs` regenerates the PWA PNG icons (`npm run icons`).

The project is built with Vite, TypeScript, [Konva](https://konvajs.org/) and vite-plugin-pwa. `package.json` pins `serialize-javascript` to 6.0.2 so that builds work on Node 18.
