/** Pure operations on the base image. Each returns a new canvas. */

export function newCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

const ctx2d = (c: HTMLCanvasElement) => c.getContext('2d')!;

export function blankCanvas(w: number, h: number, color = '#ffffff') {
  const c = newCanvas(w, h);
  const ctx = ctx2d(c);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, c.width, c.height);
  return c;
}

export function rotateCanvas(src: HTMLCanvasElement, clockwise: boolean) {
  const c = newCanvas(src.height, src.width);
  const ctx = ctx2d(c);
  if (clockwise) {
    ctx.translate(src.height, 0);
    ctx.rotate(Math.PI / 2);
  } else {
    ctx.translate(0, src.width);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(src, 0, 0);
  return c;
}

export function flipCanvas(src: HTMLCanvasElement, horizontal: boolean) {
  const c = newCanvas(src.width, src.height);
  const ctx = ctx2d(c);
  if (horizontal) {
    ctx.translate(src.width, 0);
    ctx.scale(-1, 1);
  } else {
    ctx.translate(0, src.height);
    ctx.scale(1, -1);
  }
  ctx.drawImage(src, 0, 0);
  return c;
}

export function cropCanvas(src: HTMLCanvasElement, r: { x: number; y: number; width: number; height: number }) {
  const c = newCanvas(r.width, r.height);
  ctx2d(c).drawImage(src, -r.x, -r.y);
  return c;
}

export function resizeCanvas(src: HTMLCanvasElement, w: number, h: number) {
  // Halve repeatedly first when shrinking a lot, for a smoother result.
  let cur = src;
  while (cur.width / 2 > w && cur.height / 2 > h) {
    const half = newCanvas(cur.width / 2, cur.height / 2);
    const hctx = ctx2d(half);
    hctx.imageSmoothingQuality = 'high';
    hctx.drawImage(cur, 0, 0, half.width, half.height);
    cur = half;
  }
  const c = newCanvas(w, h);
  const ctx = ctx2d(c);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, c.width, c.height);
  return c;
}

/** Blocky copy of the image, used by blur regions. */
export function pixelateCanvas(src: HTMLCanvasElement) {
  const block = Math.max(10, Math.round(Math.max(src.width, src.height) / 70));
  const small = newCanvas(Math.ceil(src.width / block), Math.ceil(src.height / block));
  const sctx = ctx2d(small);
  sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(src, 0, 0, small.width, small.height);
  const out = newCanvas(src.width, src.height);
  const octx = ctx2d(out);
  octx.imageSmoothingEnabled = false;
  octx.drawImage(small, 0, 0, small.width * block, small.height * block);
  return out;
}
