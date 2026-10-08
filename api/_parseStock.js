/**
 * Convierte el CSV publicado de la pestaña "Resumen" del Google Sheets en
 * `{ slug: quedan }`.
 *
 * El contrato con la hoja es mínimo a propósito: dos columnas llamadas `slug` y
 * `quedan` (en cualquier orden y con cualquier otra columna al lado). Todo lo
 * demás de la hoja —nombres, teléfonos, mails de compradores— NO viaja: este
 * archivo sólo devuelve esas dos cosas, y la hoja que se publica es sólo la de
 * totales.
 */

/** CSV con comillas y saltos de línea dentro de un campo (RFC 4180, lo justo). */
export const parseCsv = (texto) => {
  const filas = [];
  let fila = [];
  let campo = "";
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (c === '"') {
        comillas = false;
      } else {
        campo += c;
      }
    } else if (c === '"') {
      comillas = true;
    } else if (c === ",") {
      fila.push(campo);
      campo = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(campo);
      campo = "";
      filas.push(fila);
      fila = [];
    } else {
      campo += c;
    }
  }
  if (campo !== "" || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  return filas;
};

const SLUG_VALIDO = /^[a-z0-9][a-z0-9-]{0,79}$/;

/**
 * Devuelve `{ [slug]: entero >= 0 }`. Ignora lo que no entiende (filas vacías,
 * slugs raros, "quedan" que no es un número) en vez de fallar: una fila mal
 * escrita en la hoja no tiene que dejar sin stock a todas las demás fiestas.
 */
export const parseStock = (csv) => {
  const filas = parseCsv(csv);
  if (filas.length === 0) return {};
  const cabecera = filas[0].map((h) => h.trim().toLowerCase());
  const iSlug = cabecera.indexOf("slug");
  const iQuedan = cabecera.indexOf("quedan");
  if (iSlug === -1 || iQuedan === -1) return {};

  const stock = {};
  for (const fila of filas.slice(1)) {
    const slug = (fila[iSlug] ?? "").trim().toLowerCase();
    if (!SLUG_VALIDO.test(slug)) continue;
    const crudo = (fila[iQuedan] ?? "").trim();
    if (!/^\d[\d.,]*$/.test(crudo)) continue; // "#N/A", vacío, texto…
    const n = Math.floor(Number(crudo.replace(/[.,]/g, "")));
    if (Number.isFinite(n) && n >= 0) stock[slug] = n;
  }
  return stock;
};
