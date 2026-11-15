// Renders the PWA PNG icons (same design as public/icon.svg) without any
// image tooling: signed-distance shapes, 4x4 supersampling, raw PNG encoding.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
const png = (size, rgba) => {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
};

// Shapes in the 512-unit design space.
const roundRect = (x, y, r) => {
  const qx = Math.abs(x - 256) - (256 - r), qy = Math.abs(y - 256) - (256 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const segment = (x, y, ax, ay, bx, by) => {
  const px = x - ax, py = y - ay, dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - dx * t, py - dy * t);
};
const inTriangle = (x, y, [a, b, c]) => {
  const s = (p, q) => (x - q[0]) * (p[1] - q[1]) - (p[0] - q[0]) * (y - q[1]);
  const d1 = s(a, b), d2 = s(b, c), d3 = s(c, a);
  return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
};
const tri = [[250, 150], [372, 140], [362, 262]];

function sample(x, y, maskable) {
  // maskable icons need a full-bleed background and content in the safe zone
  if (maskable) { const k = 0.8; x = 256 + (x - 256) / k; y = 256 + (y - 256) / k; }
  const inside = maskable || roundRect(x, y, 112) <= 0;
  if (!inside) return [0, 0, 0, 0];
  const t = Math.max(0, Math.min(1, (x + y) / 1024));
  let c = [59 + (124 - 59) * t, 130 + (58 - 130) * t, 246 + (237 - 246) * t];
  const white = segment(x, y, 136, 376, 330, 182) <= 22 || inTriangle(x, y, tri) ||
    tri.some((p, i) => segment(x, y, ...p, ...tri[(i + 1) % 3]) <= 10);
  if (white) c = [255, 255, 255];
  if (Math.hypot(x - 368, y - 368) <= 56) c = [250, 204, 21];
  return [...c, 255];
}

function render(size, maskable = false) {
  const buf = Buffer.alloc(size * size * 4);
  const ss = 4, scale = 512 / size;
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const acc = [0, 0, 0, 0];
    for (let sy = 0; sy < ss; sy++) for (let sx = 0; sx < ss; sx++) {
      const s = sample((px + (sx + 0.5) / ss) * scale, (py + (sy + 0.5) / ss) * scale, maskable);
      acc[0] += s[0] * s[3]; acc[1] += s[1] * s[3]; acc[2] += s[2] * s[3]; acc[3] += s[3];
    }
    const i = (py * size + px) * 4;
    buf[i + 3] = Math.round(acc[3] / (ss * ss));
    for (let k = 0; k < 3; k++) buf[i + k] = acc[3] ? Math.round(acc[k] / acc[3]) : 0;
  }
  return png(size, buf);
}

writeFileSync('public/icon-192.png', render(192));
writeFileSync('public/icon-512.png', render(512));
writeFileSync('public/icon-maskable-512.png', render(512, true));
console.log('icons written');
