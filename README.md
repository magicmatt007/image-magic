# image-magic

**Live app: https://magicmatt007.github.io/image-magic/**

A lightweight image annotator for screenshots and pictures. It runs in any modern browser on Linux, Windows and macOS, and can be installed as a desktop app (PWA) that works offline.

## Features

- **Open an image:** paste with <kbd>Ctrl</kbd>+<kbd>V</kbd>, drag and drop, use the file picker, start from a blank canvas, or use "Open with" from the OS (installed app, Chrome/Edge only).
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
| Ctrl+V / Ctrl+O | Paste image / open file |
| Ctrl+C (or Ctrl+Shift+C) | Copy the annotated image |
| Ctrl+S / Ctrl+Shift+S | Save as PNG / JPEG |
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
- `src/io.ts` handles paste, drag and drop, opening files, the clipboard and saving.
- `src/ui/` builds the toolbar, style bar, icons, toasts and CSS.
- `scripts/make-icons.mjs` regenerates the PWA PNG icons (`npm run icons`).

The project is built with Vite, TypeScript, [Konva](https://konvajs.org/) and vite-plugin-pwa. `package.json` pins `serialize-javascript` to 6.0.2 so that builds work on Node 18.
