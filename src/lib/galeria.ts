import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { compressImageToBlob } from "@/contexts/AuthContext";

/**
 * Galería de eventos anteriores (v33): fotos y videos que carga el staff y que
 * se ven en la home, bajo Promociones.
 *
 * Lectura pública, escritura de admin y operador — lo enforza RLS; esto es sólo
 * el acceso a datos.
 */

export const GALERIA_BUCKET = "gallery";

export type GaleriaTipo = "image" | "video";

export interface GaleriaItem {
  id: string;
  kind: GaleriaTipo;
  url: string;
  /** Sólo videos: cuadro suelto para la grilla. Vacío = el del propio video. */
  posterUrl: string;
  caption: string;
  sortOrder: number;
  active: boolean;
}

/** El tope del bucket (v33). Se chequea antes de subir para avisar claro. */
export const VIDEO_MAX_MB = 50;
/** Conviene que pesen bastante menos: el visitante los baja con datos móviles. */
export const VIDEO_RECOMENDADO_MB = 15;

const desdeDb = (row: {
  id: string;
  kind: GaleriaTipo;
  url: string;
  poster_url: string | null;
  caption: string | null;
  sort_order: number;
  active: boolean;
}): GaleriaItem => ({
  id: row.id,
  kind: row.kind,
  url: row.url,
  posterUrl: row.poster_url ?? "",
  caption: row.caption ?? "",
  sortOrder: row.sort_order,
  active: row.active,
});

/**
 * Lo que muestra la home. No tira: con la migración sin correr o sin red
 * devuelve vacío y la sección simplemente no aparece — es un adorno, no puede
 * romper la home.
 */
export async function fetchGaleriaActiva(): Promise<GaleriaItem[]> {
  try {
    const { data, error } = await supabase
      .from("gallery_items")
      .select("*")
      .eq("active", true)
      .order("sort_order");
    if (error) throw error;
    return (data ?? []).map(desdeDb);
  } catch {
    return [];
  }
}

/** Todos, para el panel. Acá SÍ tira: el staff tiene que enterarse si falla. */
export async function fetchGaleria(): Promise<GaleriaItem[]> {
  const { data, error } = await supabase.from("gallery_items").select("*").order("sort_order");
  if (error) throw error;
  return (data ?? []).map(desdeDb);
}

export type GaleriaInput = Omit<GaleriaItem, "id">;

const haciaDb = (g: Partial<GaleriaInput>) => {
  const out: Record<string, unknown> = {};
  if (g.kind !== undefined) out.kind = g.kind;
  if (g.url !== undefined) out.url = g.url;
  if (g.posterUrl !== undefined) out.poster_url = g.posterUrl || null;
  if (g.caption !== undefined) out.caption = g.caption;
  if (g.sortOrder !== undefined) out.sort_order = g.sortOrder;
  if (g.active !== undefined) out.active = g.active;
  return out;
};

export async function createGaleriaItem(g: GaleriaInput): Promise<void> {
  const { error } = await supabase.from("gallery_items").insert(haciaDb(g));
  if (error) throw error;
}

export async function updateGaleriaItem(id: string, g: Partial<GaleriaInput>): Promise<void> {
  const { error } = await supabase.from("gallery_items").update(haciaDb(g)).eq("id", id);
  if (error) throw error;
}

/** Ruta dentro del bucket a partir de la URL pública, o null si no es de él. */
const rutaEnBucket = (url: string): string | null => {
  const marca = `/${GALERIA_BUCKET}/`;
  const i = url.indexOf(marca);
  return i >= 0 ? decodeURIComponent(url.slice(i + marca.length).split("?")[0]) : null;
};

/**
 * Borra la fila y, después, los archivos. El orden importa: si fallara el
 * borrado del archivo, queda un huérfano (inofensivo); al revés, la home
 * mostraría una imagen rota.
 */
export async function deleteGaleriaItem(item: GaleriaItem): Promise<void> {
  const { error } = await supabase.from("gallery_items").delete().eq("id", item.id);
  if (error) throw error;
  const rutas = [rutaEnBucket(item.url), item.posterUrl ? rutaEnBucket(item.posterUrl) : null].filter(
    (r): r is string => !!r
  );
  if (rutas.length) await supabase.storage.from(GALERIA_BUCKET).remove(rutas).catch(() => undefined);
}

const nombreUnico = (ext: string) =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

const urlPublica = (path: string) =>
  supabase.storage.from(GALERIA_BUCKET).getPublicUrl(path).data.publicUrl;

const conTiempoMaximo = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);

/**
 * Un cuadro suelto del video, para la miniatura de la grilla. Si el navegador
 * no puede decodificarlo (un .mov en HEVC en Chrome, por ejemplo) devuelve null
 * y el video se sube igual, sin póster.
 */
async function capturarPoster(file: File): Promise<Blob | null> {
  const src = URL.createObjectURL(file);
  try {
    const v = document.createElement("video");
    v.muted = true;
    v.playsInline = true;
    v.preload = "auto";
    v.src = src;
    await conTiempoMaximo(
      new Promise<void>((res, rej) => {
        v.onloadeddata = () => res();
        v.onerror = () => rej(new Error("video"));
      }),
      8000
    );
    v.currentTime = Math.min(1, (v.duration || 2) / 2);
    await conTiempoMaximo(
      new Promise<void>((res, rej) => {
        v.onseeked = () => res();
        v.onerror = () => rej(new Error("video"));
      }),
      8000
    );
    const ancho = Math.min(960, v.videoWidth);
    if (!ancho) return null;
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = Math.round((ancho * v.videoHeight) / v.videoWidth);
    canvas.getContext("2d")?.drawImage(v, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.8));
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(src);
  }
}

/**
 * Sube un archivo de la galería. Las fotos se achican a 1600 px de ancho (lo
 * que sobra pesa y no se nota); los videos se suben tal cual, con su póster.
 */
export async function uploadGaleria(
  file: File
): Promise<{ kind: GaleriaTipo; url: string; posterUrl: string }> {
  if (file.type.startsWith("image/")) {
    const blob = await compressImageToBlob(file, 1600, 0.85);
    const path = `fotos/${nombreUnico("jpg")}`;
    const { error } = await supabase.storage
      .from(GALERIA_BUCKET)
      .upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) throw error;
    return { kind: "image", url: urlPublica(path), posterUrl: "" };
  }

  if (file.type.startsWith("video/")) {
    if (file.size > VIDEO_MAX_MB * 1024 * 1024) {
      throw new Error(
        `El video pesa ${(file.size / 1024 / 1024).toFixed(0)} MB y el máximo es ${VIDEO_MAX_MB} MB. Comprimilo antes de subirlo.`
      );
    }
    const ext = file.type === "video/webm" ? "webm" : file.type === "video/quicktime" ? "mov" : "mp4";
    const path = `videos/${nombreUnico(ext)}`;
    const { error } = await supabase.storage
      .from(GALERIA_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;

    let posterUrl = "";
    const poster = await capturarPoster(file);
    if (poster) {
      const pPath = `posters/${nombreUnico("jpg")}`;
      const { error: pErr } = await supabase.storage
        .from(GALERIA_BUCKET)
        .upload(pPath, poster, { contentType: "image/jpeg", upsert: false });
      if (!pErr) posterUrl = urlPublica(pPath);
    }
    return { kind: "video", url: urlPublica(path), posterUrl };
  }

  throw new Error("El archivo tiene que ser una foto o un video.");
}

/**
 * Los items activos para la home y el header, con UNA sola consulta por carga
 * de página aunque lo usen varios componentes (el header decide si muestra el
 * botón "Eventos anteriores" con el mismo dato que la sección).
 * `null` = todavía no contestó.
 */
let pendiente: Promise<GaleriaItem[]> | null = null;

export const useGaleria = (): GaleriaItem[] | null => {
  const [items, setItems] = useState<GaleriaItem[] | null>(null);
  useEffect(() => {
    let vivo = true;
    pendiente ??= fetchGaleriaActiva();
    pendiente.then((r) => vivo && setItems(r));
    return () => {
      vivo = false;
    };
  }, []);
  return items;
};
