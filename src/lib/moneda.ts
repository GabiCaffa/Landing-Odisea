/**
 * Moneda por evento (v48): pesos uruguayos o dólares.
 *
 * Hasta acá el "$" estaba escrito a mano en cada pantalla. Ahora todo precio se
 * escribe con `fmtPrecio(monto, moneda)`, y la moneda sale SIEMPRE del evento:
 * un evento se vende entero en una moneda (entradas, promos, total y ventas).
 *
 * **Nunca se suman pesos con dólares.** Donde se juntan varios eventos (el
 * recaudado del panel, la Historia, el ranking) los totales van por moneda:
 * `sumarPorMoneda` + `fmtTotales`.
 *
 * Sin dependencias: lo importan también el armado del mensaje de WhatsApp y
 * los scripts de prueba.
 */

export type Moneda = "UYU" | "USD";

export const MONEDAS: readonly Moneda[] = ["UYU", "USD"];

export const MONEDA_NOMBRE: Record<Moneda, string> = {
  UYU: "Pesos uruguayos ($)",
  USD: "Dólares (US$)",
};

/** Cualquier cosa que venga de la base → una moneda válida. Lo desconocido es pesos. */
export const monedaDe = (v: unknown): Moneda => (v === "USD" ? "USD" : "UYU");

/**
 * "$800" o "US$ 20". En dólares va con espacio: "US$20" se lee pegado. Hasta
 * dos decimales, sólo si los hay (un total con promo puede no ser redondo).
 */
export function fmtPrecio(monto: number, moneda: Moneda = "UYU"): string {
  const n = monto.toLocaleString("es-UY", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return moneda === "USD" ? `US$ ${n}` : `$${n}`;
}

/**
 * "$1600" o "US$ 40": el número tal cual, sin separador de miles. Es como la
 * web pública y el mensaje de WhatsApp escribieron siempre los pesos; usar
 * `fmtPrecio` ahí cambiaría lo que ya se ve sin que nadie lo pidiera. El panel
 * usa `fmtPrecio`.
 */
export const fmtSimple = (monto: number, moneda: Moneda = "UYU"): string =>
  moneda === "USD" ? `US$ ${monto}` : `$${monto}`;

/** Lo que se escribe delante del número en un campo de precio. */
export const simbolo = (moneda: Moneda): string => (moneda === "USD" ? "US$" : "$");

export type Totales = Record<Moneda, number>;

export const SIN_TOTALES: Totales = { UYU: 0, USD: 0 };

/** Suma montos sin mezclar monedas. */
export function sumarPorMoneda<T>(filas: T[], monto: (f: T) => number, moneda: (f: T) => Moneda): Totales {
  const t: Totales = { UYU: 0, USD: 0 };
  for (const f of filas) t[moneda(f)] += monto(f);
  return t;
}

/**
 * "$62.800 · US$ 1.200". Las monedas en cero no se nombran; si no hay nada,
 * "$0". Redondeado: es para tarjetas de resumen, no para cobrar.
 */
export function fmtTotales(t: Totales): string {
  const partes = MONEDAS.filter((m) => Math.round(t[m]) !== 0).map((m) => fmtPrecio(Math.round(t[m]), m));
  return partes.length ? partes.join(" · ") : fmtPrecio(0, "UYU");
}
