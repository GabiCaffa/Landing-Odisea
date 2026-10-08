import { useEffect, useState } from "react";

/**
 * El "Quedan N entradas" calculado desde las ventas anotadas en el Google Sheets.
 *
 * Lo sirve `/api/stock` (ver `api/stock.js`), que lee la pestaña "Resumen" de la
 * hoja y devuelve `{ stock: { slug: quedan } }`. Si una fiesta está ahí, ese
 * número **manda sobre el que se carga a mano en el panel** (v29); si no está, o
 * si algo falla, se usa el manual. Nunca rompe la página: ante cualquier error
 * devuelve vacío.
 *
 * En desarrollo (`vite`) `/api/stock` no existe y devuelve el index.html: el
 * `json()` falla, se atrapa, y el resultado es vacío.
 */

export type StockHoja = Record<string, number>;

/** Se vuelve a pedir pasado este tiempo, pero no en cada render ni en cada tarjeta. */
const VIGENCIA_MS = 60_000;

let guardado: { cuando: number; promesa: Promise<StockHoja> } | null = null;

const limpiar = (crudo: unknown): StockHoja => {
  const out: StockHoja = {};
  if (!crudo || typeof crudo !== "object") return out;
  for (const [slug, n] of Object.entries(crudo as Record<string, unknown>)) {
    if (typeof n === "number" && Number.isFinite(n) && n >= 0) out[slug] = Math.floor(n);
  }
  return out;
};

export const fetchStockHoja = (): Promise<StockHoja> => {
  const ahora = Date.now();
  if (guardado && ahora - guardado.cuando < VIGENCIA_MS) return guardado.promesa;
  const promesa = fetch("/api/stock")
    .then((r) => (r.ok ? r.json() : { stock: {} }))
    .then((j) => limpiar(j?.stock))
    .catch(() => ({}) as StockHoja);
  guardado = { cuando: ahora, promesa };
  return promesa;
};

/**
 * Qué muestra una tarjeta o una página: el número de la hoja si hay uno para esa
 * fiesta, y si no el manual. **Un 0 de la hoja no muestra nada**: un lote sin
 * entradas se apaga desde el panel, no con un cartel de cero.
 */
export const stockAMostrar = (
  deLaHoja: number | undefined,
  manual: number | undefined
): number | undefined =>
  deLaHoja !== undefined ? (deLaHoja > 0 ? deLaHoja : undefined) : manual;

export const useStockHoja = (): StockHoja => {
  const [stock, setStock] = useState<StockHoja>({});
  useEffect(() => {
    let vivo = true;
    fetchStockHoja().then((s) => {
      if (vivo) setStock(s);
    });
    return () => {
      vivo = false;
    };
  }, []);
  return stock;
};
