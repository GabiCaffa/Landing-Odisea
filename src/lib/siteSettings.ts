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
