import { supabase, EVENT_IMAGES_BUCKET } from "@/lib/supabase";
import { compressImageToBlob } from "@/contexts/AuthContext";

/**
 * Banners del slider del hero (v27).
 *
 * Lectura pública, escritura sólo admin — lo enforza RLS, esto es sólo el
 * acceso a datos.
 */

export interface SiteBanner {
  id: string;
  imageUrl: string;
  /** Versión vertical para celular. Vacío = se usa la de escritorio. */
  imageUrlMobile: string;
  alt: string;
  linkUrl: string;
  sortOrder: number;
  active: boolean;
}

/** El formato acordado con el diseñador. */
export const BANNER_ANCHO = 1920;
export const BANNER_ALTO = 600;
/** 1920×600. Se usa como `aspect-[16/5]` en el CSS. */
export const BANNER_PROPORCION = "16 / 5";

/** Lo que conviene pedirle al diseñador para el celular. */
export const BANNER_MOVIL_ANCHO = 1080;
export const BANNER_MOVIL_ALTO = 1350;
export const BANNER_MOVIL_PROPORCION = "4 / 5";

const desdeDb = (row: {
  id: string;
  image_url: string;
  image_url_mobile: string | null;
  alt: string | null;
  link_url: string | null;
  sort_order: number;
  active: boolean;
}): SiteBanner => ({
  id: row.id,
  imageUrl: row.image_url,
  imageUrlMobile: row.image_url_mobile ?? "",
  alt: row.alt ?? "",
  linkUrl: row.link_url ?? "",
  sortOrder: row.sort_order,
  active: row.active,
});

/**
 * Los banners que tiene que mostrar la home. No tira: si la consulta falla
 * —sin red, la migración todavía sin correr— devuelve vacío y la home cae al
 * hero de siempre. Un hero es lo primero que se ve: no puede depender de que
 * una consulta salga bien.
 */
export async function fetchBannersActivos(): Promise<SiteBanner[]> {
  try {
    const { data, error } = await supabase
      .from("site_banners")
      .select("*")
      .eq("active", true)
      .order("sort_order");
    if (error) throw error;
    return (data ?? []).map(desdeDb);
  } catch {
    return [];
  }
}

/** Todos, para el panel. Acá sí TIRA: si el admin no puede ver lo que hay,
 *  tiene que enterarse, no quedarse mirando una lista vacía (la lección de
 *  `fetchDeliveries` en v24). */
export async function fetchBanners(): Promise<SiteBanner[]> {
  const { data, error } = await supabase
    .from("site_banners")
    .select("*")
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map(desdeDb);
}

export type BannerInput = Omit<SiteBanner, "id">;

const haciaDb = (b: Partial<BannerInput>) => {
  const out: Record<string, unknown> = {};
  if (b.imageUrl !== undefined) out.image_url = b.imageUrl;
  if (b.imageUrlMobile !== undefined) out.image_url_mobile = b.imageUrlMobile || null;
  if (b.alt !== undefined) out.alt = b.alt;
  if (b.linkUrl !== undefined) out.link_url = b.linkUrl || null;
  if (b.sortOrder !== undefined) out.sort_order = b.sortOrder;
  if (b.active !== undefined) out.active = b.active;
  return out;
};

export async function createBanner(b: BannerInput): Promise<void> {
  const { error } = await supabase.from("site_banners").insert(haciaDb(b));
  if (error) throw error;
}

export async function updateBanner(id: string, b: Partial<BannerInput>): Promise<void> {
  const { error } = await supabase.from("site_banners").update(haciaDb(b)).eq("id", id);
  if (error) throw error;
}

export async function deleteBanner(id: string): Promise<void> {
  const { error } = await supabase.from("site_banners").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Sube la imagen de un banner al bucket público que ya existe, bajo
 * `banners/`.
 *
 * **No reusa `uploadEventImage` a propósito**: ésa comprime a 800 px de ancho,
 * que es lo correcto para una tarjeta de 320 px y destruiría un banner de
 * 1920. Acá se respeta el ancho acordado.
 */
export async function uploadBanner(
  file: File,
  variante: "escritorio" | "movil"
): Promise<string> {
  const ancho = variante === "movil" ? BANNER_MOVIL_ANCHO : BANNER_ANCHO;
  const blob = await compressImageToBlob(file, ancho, 0.85);
  const path = `banners/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage
    .from(EVENT_IMAGES_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return supabase.storage.from(EVENT_IMAGES_BUCKET).getPublicUrl(path).data.publicUrl;
}
