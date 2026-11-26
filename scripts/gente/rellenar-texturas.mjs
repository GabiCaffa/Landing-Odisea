// Copia una carpeta de .gltf y crea un PNG de 1x1 por cada imagen referenciada
// que no está en el paquete (son mapas de normales que igual se descartan).
import fs from "fs"; import path from "path"; import sharp from "sharp";
const [src, dst] = process.argv.slice(2);
fs.mkdirSync(dst, { recursive: true });
for (const f of fs.readdirSync(src)) fs.copyFileSync(path.join(src, f), path.join(dst, f));
const px = await sharp({ create: { width: 1, height: 1, channels: 3, background: "#8080ff" } }).png().toBuffer();
for (const f of fs.readdirSync(dst).filter((f) => f.endsWith(".gltf"))) {
  const j = JSON.parse(fs.readFileSync(path.join(dst, f), "utf8"));
  for (const im of j.images || []) if (im.uri && !fs.existsSync(path.join(dst, decodeURIComponent(im.uri)))) { fs.writeFileSync(path.join(dst, decodeURIComponent(im.uri)), px); console.log("falta", f, im.uri); }
}
