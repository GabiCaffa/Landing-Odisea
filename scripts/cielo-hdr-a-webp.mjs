// Pasa un cielo .hdr de Poly Haven a la imagen que usa el croquis 3D.
// Necesita sharp (se instala aparte, no es dependencia del sitio).
// Pasa un .hdr (Radiance RGBE) a una imagen común (equirectangular) para el cielo
// del croquis: exposición, curva ACES y sRGB, y WebP liviano.
// Uso: node hdr-a-webp.mjs <entrada.hdr> <salida.webp> <exposicion> [ancho]
import fs from "fs";
import sharp from "sharp";

const [entrada, salida, exp = "1", ancho = "1024"] = process.argv.slice(2);
const b = fs.readFileSync(entrada);
let i = 0;
const linea = () => {
  let s = "";
  while (b[i] !== 0x0a) s += String.fromCharCode(b[i++]);
  i++;
  return s;
};
let l;
while ((l = linea()) !== "");
const [, hStr, , wStr] = linea().trim().split(/\s+/);
const H = +hStr;
const W = +wStr;
const rgbe = new Uint8Array(W * H * 4);
for (let y = 0; y < H; y++) {
  if (b[i] !== 2 || b[i + 1] !== 2) throw new Error("formato RLE no soportado");
  i += 4;
  const fila = new Uint8Array(W * 4);
  for (let c = 0; c < 4; c++) {
    let x = 0;
    while (x < W) {
      let n = b[i++];
      if (n > 128) {
        n -= 128;
        const v = b[i++];
        for (let k = 0; k < n; k++) fila[(x++) * 4 + c] = v;
      } else for (let k = 0; k < n; k++) fila[(x++) * 4 + c] = b[i++];
    }
  }
  rgbe.set(fila, y * W * 4);
}
const aces = (x) => Math.min(1, Math.max(0, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14)));
const srgb = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);
const out = Buffer.alloc(W * H * 3);
const e = +exp;
for (let p = 0; p < W * H; p++) {
  const f = rgbe[p * 4 + 3] ? Math.pow(2, rgbe[p * 4 + 3] - 136) : 0;
  for (let c = 0; c < 3; c++) out[p * 3 + c] = Math.round(srgb(aces(rgbe[p * 4 + c] * f * e)) * 255);
}
await sharp(out, { raw: { width: W, height: H, channels: 3 } })
  .resize(+ancho, +ancho / 2)
  .webp({ quality: 80 })
  .toFile(salida);
console.log(salida, W, H, "→", ancho, Math.round(fs.statSync(salida).size / 1024), "KB");
