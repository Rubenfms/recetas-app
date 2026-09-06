/**
 * Genera los iconos de la PWA sin depender de ninguna librería de imagen.
 * Dibuja con primitivas (círculos y rectángulos redondeados) sobre un búfer
 * RGBA y lo codifica como PNG a mano: cabecera, IDAT deflateado y CRC32.
 *
 *   node scripts/make-icons.mjs
 *
 * Los PNG resultantes se commitean: el workflow de Pages solo hace `vite
 * build` y necesita encontrarlos ya hechos. Son la única excepción a la regla
 * de «ninguna imagen en el repo» del .gitignore, y no son fotos de producto.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');

const BG = [0x12, 0x21, 0x1c, 0xff];
const FG = [0x6e, 0xe7, 0xa8, 0xff];

// --------------------------------------------------------------- PNG

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // profundidad de bit
  ihdr[9] = 6; // color RGBA
  // 10..12: compresión, filtro e interlazado, todos 0.

  // Cada scanline lleva delante su byte de filtro; usamos 0 (sin filtro).
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// --------------------------------------------------------------- dibujo

/** Rectángulo redondeado en coordenadas normalizadas [0,1]. */
function inRoundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  if (x < x0 || x > x1 || y < y0 || y > y1) return false;
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function inRing(x, y, cx, cy, outer, inner) {
  const d = Math.hypot(x - cx, y - cy);
  return d <= outer && d >= inner;
}

/**
 * Un plato con cubiertos. `inset` encoge el dibujo para dejar la zona segura
 * de los iconos maskable, a los que el sistema les recorta los bordes.
 */
function isForeground(x, y, inset) {
  const s = (v) => 0.5 + (v - 0.5) * inset;
  const px = 0.5 + (x - 0.5) / inset;
  const py = 0.5 + (y - 0.5) / inset;
  void s;
  if (px < 0 || px > 1 || py < 0 || py > 1) return false;

  // Plato
  if (inRing(px, py, 0.5, 0.52, 0.235, 0.185)) return true;
  if (inRing(px, py, 0.5, 0.52, 0.115, 0)) return true;

  // Tenedor: mango y tres púas
  if (inRoundRect(px, py, 0.135, 0.44, 0.185, 0.86, 0.025)) return true;
  for (const tx of [0.125, 0.16, 0.195]) {
    if (inRoundRect(px, py, tx - 0.014, 0.16, tx + 0.014, 0.38, 0.014)) return true;
  }
  if (inRoundRect(px, py, 0.121, 0.36, 0.199, 0.46, 0.03)) return true;

  // Cuchillo: hoja y mango
  if (inRoundRect(px, py, 0.815, 0.16, 0.875, 0.5, 0.03)) return true;
  if (inRoundRect(px, py, 0.828, 0.46, 0.862, 0.86, 0.017)) return true;

  return false;
}

function render(size, { maskable }) {
  const rgba = Buffer.alloc(size * size * 4);
  const inset = maskable ? 0.78 : 1;
  const corner = maskable ? 0 : 0.2;
  const SS = 3; // supersampling: sin esto los bordes quedan dentados

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let inside = 0;
      let fg = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const nx = (x + (sx + 0.5) / SS) / size;
          const ny = (y + (sy + 0.5) / SS) / size;
          const onCanvas = corner === 0 || inRoundRect(nx, ny, 0, 0, 1, 1, corner);
          if (!onCanvas) continue;
          inside += 1;
          if (isForeground(nx, ny, inset)) fg += 1;
        }
      }

      const total = SS * SS;
      const alpha = inside / total;
      const fgRatio = inside === 0 ? 0 : fg / inside;
      const offset = (y * size + x) * 4;
      for (let c = 0; c < 3; c += 1) {
        rgba[offset + c] = Math.round(BG[c] + (FG[c] - BG[c]) * fgRatio);
      }
      rgba[offset + 3] = Math.round(255 * alpha);
    }
  }

  return encodePng(size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });
const targets = [
  ['icon-192.png', 192, { maskable: false }],
  ['icon-512.png', 512, { maskable: false }],
  ['icon-maskable-512.png', 512, { maskable: true }],
];
for (const [name, size, opts] of targets) {
  const png = render(size, opts);
  writeFileSync(join(OUT_DIR, name), png);
  console.log(`${name}  ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`);
}
