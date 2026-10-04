import { supabase } from "@/lib/supabase";

/**
 * Ajustes globales del sitio: tabla clave/valor con lectura pública y escritura
 * sólo admin. Ver supabase/v19_site_settings.sql.
 *
 * Hoy la única clave es `theme`, el tema estacional de la landing.
 */

/** Temas que el CSS sabe pintar. Tiene que coincidir con los bloques
 *  `[data-theme="..."]` de src/index.css. */
export const SITE_THEMES = ["base", "halloween"] as const;
export type SiteTheme = (typeof SITE_THEMES)[number];

export const DEFAULT_THEME: SiteTheme = "base";

/** La DB no valida el valor (ver el comentario final de v19): lo hacemos acá.
 *  Un tema desconocido cae en 'base' en vez de dejar el sitio a medio pintar. */
export const isSiteTheme = (value: unknown): value is SiteTheme =>
  typeof value === "string" && (SITE_THEMES as readonly string[]).includes(value);

/** Nombre visible de cada tema en el panel. */
export const THEME_LABELS: Record<SiteTheme, string> = {
  base: "ODÍSEA",
  halloween: "Halloween",
};

// ─── Acceso a datos ─────────────────────────────────────────────────────────

export async function fetchSetting(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

export async function saveSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase
    .from("site_settings")
    .upsert({ key, value }, { onConflict: "key" });
  if (error) throw error;
}

/**
 * Tema activo del sitio. No tira: si la consulta falla (sin red, RLS, la
 * migración todavía sin correr) devuelve 'base'. Es deliberado — que no se
 * pueda leer una preferencia estética no es motivo para romperle la home a
 * nadie.
 */
export async function fetchTheme(): Promise<SiteTheme> {
  try {
    const value = await fetchSetting("theme");
    return isSiteTheme(value) ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export async function saveTheme(theme: SiteTheme): Promise<void> {
  await saveSetting("theme", theme);
}

// ─── Cartel de las tarjetas de evento ───────────────────────────────────────

/**
 * Texto que se muestra como cartel en las tarjetas de los eventos activos.
 * Vacío o ausente = sin cartel.
 *
 * **Es SÓLO una etiqueta. No descuenta nada, y no tiene que descontar nada.**
 * Eso no es un detalle de implementación sino la regla del negocio: el precio
 * que se carga en el evento YA viene con el descuento aplicado. Si esto se
 * cargara como una promo de verdad (v21), el sitio le restaría el porcentaje
 * **otra vez** sobre un precio que ya lo tiene — una entrada de $1.000 saldría
 * $850 cuando $1.000 ya era el precio rebajado.
 *
 * Por eso vive acá y no en `ticket_promos`: son dos cosas que se parecen en la
 * pantalla y no tienen nada que ver abajo. Una pinta, la otra cobra.
 */
export const CARTEL_KEY = "cartel_eventos";

/** Entra en una píldora arriba de la tarjeta; más largo se desborda. */
export const CARTEL_MAX = 24;

export const limpiarCartel = (value: unknown): string =>
  typeof value === "string" ? value.trim().slice(0, CARTEL_MAX) : "";

/** No tira: un cartel que no se puede leer no es motivo para romper la home. */
export async function fetchCartel(): Promise<string> {
  try {
    return limpiarCartel(await fetchSetting(CARTEL_KEY));
  } catch {
    return "";
  }
}

export async function saveCartel(texto: string): Promise<void> {
  await saveSetting(CARTEL_KEY, limpiarCartel(texto));
}

// ─── Comisión de ticketera (el precio tachado) ──────────────────────────────

/**
 * Comisión que las ticketeras le suman al precio de la entrada, en por ciento.
 * 0 o ausente = no se tacha ningún precio.
 *
 * **Qué es esto, porque el nombre importa.** NO es un descuento que ODÍSEA
 * hace: es el cargo por servicio que cobran las plataformas de venta. Una
 * entrada de $600 en una ticketera sale $690, porque le suman su 15%. Acá sale
 * $600, porque se vende directo y ese cargo no existe. Eso es lo que el cartel
 * "15% OFF" quiere decir.
 *
 * Por eso:
 *
 * - **La cuenta es `precio × (1 + comisión/100)`** y no `precio ÷ (1 −
 *   d/100)`. No es la fórmula de un descuento aproximada: es literalmente cómo
 *   la ticketera calcula lo que cobra.
 * - **El número tachado es un precio REAL**, el de la competencia, no un
 *   "precio de lista" inventado para que el descuento parezca más grande. Esa
 *   distinción es justamente la que mira la ley de relaciones de consumo
 *   cuando se anuncia una rebaja.
 * - **Es el mismo para todos los eventos**, porque la comisión no depende de
 *   la fecha. Por eso vive acá, en los ajustes del sitio, y no en cada evento.
 *
 * > No confundir con las promos de v21, que sí descuentan de verdad sobre el
 * > precio. Esto no toca el total ni el mensaje de WhatsApp: sólo se pinta.
 */
export const COMISION_KEY = "comision_ticketera";

/** Ninguna ticketera cobra más que esto; arriba es un error de tipeo. */
export const COMISION_MAX = 50;

export const limpiarComision = (value: unknown): number => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n), COMISION_MAX);
};

/**
 * Lo que esa entrada costaría en una ticketera: el número que va tachado.
 * Devuelve 0 si no hay comisión configurada, o sea si no hay que tachar nada.
 */
export const precioConComision = (precio: number, comision: number): number =>
  comision > 0 ? Math.round(precio * (1 + comision / 100)) : 0;

/** No tira: un precio tachado que no se puede leer no rompe la venta. */
export async function fetchComision(): Promise<number> {
  try {
    return limpiarComision(await fetchSetting(COMISION_KEY));
  } catch {
    return 0;
  }
}

export async function saveComision(comision: number): Promise<void> {
  await saveSetting(COMISION_KEY, String(limpiarComision(comision)));
}
