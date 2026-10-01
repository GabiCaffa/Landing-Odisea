/**
 * Prueba de las páginas por evento (v25). Para correrla:
 *
 *   npm run build
 *   npx esbuild vite/paginasEvento.ts --bundle --format=esm --packages=external \
 *     --outfile=scripts/paginasEvento.bundle.mjs
 *   node scripts/probar-paginas-evento.mjs
 *   rm scripts/paginasEvento.bundle.mjs
 *
 * Hace falta el bundle porque el archivo es TypeScript y esto corre en node
 * pelado. No es lindo, pero la alternativa era no probar la pieza más frágil
 * de todo esto.
 *
 * YA ENCONTRÓ UN BUG: la primera versión reemplazaba el PRIMER <noscript> del
 * documento, que no es el de contenido sino el de la hoja de estilos para quien
 * tiene JavaScript apagado. El archivo se veía perfecto.
 */
import fs from "node:fs";
import { htmlDeEvento } from "./paginasEvento.bundle.mjs";

const base = fs.readFileSync("dist/index.html", "utf8");

const evento = {
  slug: "halloween-colonia",
  name: "HALLOWEEN COLONIA",
  date: "2026-10-31",
  location: "PLAZA DE TOROS",
  description: "La noche más oscura del año en Colonia del Sacramento.",
  image_url:
    "https://xyz.supabase.co/storage/v1/object/public/event-images/halloween.jpg",
  status: "activo",
  event_ticket_types: [
    { price: 900, active: true },
    { price: 1500, active: true },
    { price: 400, active: false },
  ],
};

const html = htmlDeEvento(base, evento);

let fallos = 0;
const check = (titulo, ok, detalle = "") => {
  if (!ok) fallos++;
  console.log(`  ${ok ? "✓" : "✗"} ${titulo}${!ok && detalle ? `\n      ${detalle}` : ""}`);
};
const meta = (clave, nombre) => {
  const m = html.match(new RegExp(`<meta(?=[^>]*\\b${clave}="${nombre}")[^>]*>`, "i"));
  return m ? (m[0].match(/content="([^"]*)"/) || [])[1] ?? null : null;
};

console.log("── Lo del evento quedó puesto ─────────────────────────────");
check("El <title> nombra la fecha", /<title>[^<]*HALLOWEEN COLONIA[^<]*<\/title>/.test(html),
  (html.match(/<title>[^<]*<\/title>/) || [])[0]);
check("El <title> ya NO es el de la home", !/<title>ODÍSEA · Fiestas y eventos en Uruguay<\/title>/.test(html));
check("canonical apunta al evento",
  /<link rel="canonical" href="https:\/\/www\.odiseaoficial\.com\/evento\/halloween-colonia"/.test(html),
  (html.match(/<link[^>]*canonical[^>]*>/) || [])[0]);
check("og:url apunta al evento", meta("property", "og:url") === "https://www.odiseaoficial.com/evento/halloween-colonia", String(meta("property", "og:url")));
check("og:title nombra la fecha", (meta("property", "og:title") || "").includes("HALLOWEEN COLONIA"));
check("og:description es la del evento", (meta("property", "og:description") || "").includes("noche más oscura"));
check("twitter:title nombra la fecha", (meta("name", "twitter:title") || "").includes("HALLOWEEN COLONIA"));

console.log("\n── El flyer, que es el punto de todo esto ─────────────────");
const img = meta("property", "og:image");
check("og:image es el flyer y no el logo", !!img && img.includes("halloween.jpg"), String(img));
check("og:image pide el redimensionado de Supabase", !!img && img.includes("/render/image/public/") && img.includes("width=1200"), String(img));
check("twitter:image también", (meta("name", "twitter:image") || "").includes("halloween.jpg"));
check("og:image:alt es el nombre del evento", meta("property", "og:image:alt") === "HALLOWEEN COLONIA");
check("se sacó og:image:width (el flyer es vertical)", meta("property", "og:image:width") === null);
check("se sacó og:image:height", meta("property", "og:image:height") === null);
check("se sacó og:image:type", meta("property", "og:image:type") === null);

console.log("\n── Datos estructurados: UNO, no los de todas las fechas ───");
const jsonLd = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
check("quedan exactamente 2 bloques (Event + Organization)", jsonLd.length === 2, `hay ${jsonLd.length}`);
const ev = jsonLd.find((o) => o["@type"] === "Event");
check("el Event es el de esta página", ev?.name === "HALLOWEEN COLONIA", JSON.stringify(ev?.name));
check("no quedó ningún OTRO evento", jsonLd.filter((o) => o["@type"] === "Event").length === 1);
check("offers.url apunta al evento y no a la home", ev?.offers?.url === "https://www.odiseaoficial.com/evento/halloween-colonia", String(ev?.offers?.url));
check("el precio es el más barato ACTIVO (900, no 400)", ev?.offers?.price === 900, String(ev?.offers?.price));
check("hay Organization", jsonLd.some((o) => o["@type"] === "Organization"));

console.log("\n── Los dos <noscript>, cada uno en su lugar ───────────────");
const cuantos = (html.match(/<noscript>/g) || []).length;
check("quedan 2: el de la hoja de estilos y el de contenido", cuantos === 2, `hay ${cuantos}`);
check("NO se pisó el de la hoja de estilos", /<noscript><link rel="stylesheet"/.test(html));
check("el de contenido va después de #root", /<div id="root"><\/div>\s*<noscript><h1>/.test(html));
const ns = (html.match(/<noscript><h1>[\s\S]*?<\/noscript>/) || [])[0] || "";
check("el de contenido nombra el evento", ns.includes("HALLOWEEN COLONIA"));
check("y no lista las otras fechas", !ns.includes("Próximas fechas"));

console.log("\n── Y, sobre todo, NO rompió la página ─────────────────────");
for (const [titulo, trozo] of [
  ["el tema horneado en el <html>", /<html[^>]*data-theme=/],
  ["el <style> crítico", /<style>/],
  ["el telón de arranque", /id="arranque"/],
  ["el contenedor de React", /<div id="root"><\/div>/],
  ["el script del bundle con su hash", /<script[^>]*src="\/assets\/index-[A-Za-z0-9_-]+\.js"/],
  ["la hoja de estilos no bloqueante", /media="print"/],
]) {
  check(`sigue ${titulo}`, trozo.test(html));
}
check("el HTML no cambió de tamaño de forma absurda", Math.abs(html.length - base.length) < base.length * 0.5,
  `base ${base.length} → evento ${html.length}`);

console.log(fallos === 0 ? "\n✅ Todo bien" : `\n❌ ${fallos} fallo(s)`);
process.exit(fallos === 0 ? 0 : 1);
