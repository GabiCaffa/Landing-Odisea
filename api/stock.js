import { parseStock } from "./_parseStock.js";

/**
 * GET /api/stock → `{ stock: { "<slug>": <entradas que quedan> } }`
 *
 * Lee la pestaña "Resumen" del Google Sheets de ventas (publicada como CSV; la
 * URL va en la variable de entorno `STOCK_SHEET_CSV_URL` de Vercel) y devuelve
 * sólo `slug` y `quedan`. Es lo que hace que el "Quedan N entradas" se mueva
 * cuando se anotan ventas en la hoja, sin que nadie cargue el número dos veces.
 *
 * ─── Por qué pasa por acá y no se lee la hoja desde el navegador ───────────
 *
 * - **Caché de un minuto en el CDN de Vercel** (`s-maxage=60`): con tráfico de
 *   anuncios, cada visita le pegaría a Google. Así Google recibe como mucho una
 *   consulta por minuto, sin importar cuánta gente entre.
 * - **El sitio no depende del formato de Google.** Si algo falla (la hoja se
 *   despublicó, Google tardó, un error), esto contesta `{ stock: {} }` y el
 *   sitio usa el número manual de siempre. Nunca rompe la página.
 * - **Sólo viajan dos columnas** (ver `_parseStock.js`).
 *
 * Sin `STOCK_SHEET_CSV_URL` configurada contesta vacío: apagar esto es borrar la
 * variable, sin tocar código.
 */
const ESPERA_MAX_MS = 5000;

export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  const url = process.env.STOCK_SHEET_CSV_URL;
  // Sólo se le pega a Google Sheets: la variable la pone el dueño, pero así una
  // URL mal pegada no convierte esto en un proxy a cualquier lado.
  if (!url || !/^https:\/\/docs\.google\.com\//.test(url)) {
    res.setHeader("Cache-Control", "public, s-maxage=60");
    return res.status(200).json({ stock: {} });
  }

  try {
    const control = new AbortController();
    const timer = setTimeout(() => control.abort(), ESPERA_MAX_MS);
    const r = await fetch(url, { signal: control.signal, redirect: "follow" });
    clearTimeout(timer);
    if (!r.ok) throw new Error(`La hoja contestó ${r.status}`);

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=600");
    return res.status(200).json({ stock: parseStock(await r.text()) });
  } catch {
    // Un error se cachea poco, para reintentar enseguida; y el sitio cae al
    // número manual.
    res.setHeader("Cache-Control", "public, s-maxage=10");
    return res.status(200).json({ stock: {}, error: true });
  }
}
