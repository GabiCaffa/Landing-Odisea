import { supabase, COMPROBANTES_BUCKET } from "@/lib/supabase";
import { compressImageToBlob } from "@/contexts/AuthContext";

/**
 * Comprobantes de transferencia adjuntos a una venta (v39).
 *
 * Los pega el staff al cargar la venta (Ctrl+V, arrastrar o elegir archivo);
 * el cliente no sube nada al sitio. Viven en un bucket PRIVADO y se abren sólo
 * con URLs firmadas de 5 minutos, igual que las cédulas de cumpleaños (v12).
 */

/** Lo que se acepta: una imagen (captura, foto) o el PDF que exporta el banco. */
export function esComprobanteValido(file: File): boolean {
  return file.type.startsWith("image/") || file.type === "application/pdf";
}

export const esPdf = (pathOrType: string) => /pdf$/i.test(pathOrType);

/**
 * SHA-256 del archivo TAL COMO SE PEGÓ, antes de achicarlo. Es lo que permite
 * avisar "este comprobante ya está cargado": pegar dos veces el mismo archivo
 * da el mismo hash. Se calcula sobre el original y no sobre el JPG achicado
 * porque la compresión depende del navegador y del canvas, y el mismo
 * comprobante podría dar dos hashes distintos según desde dónde se cargó.
 */
export async function hashArchivo(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Error de Storage → algo que el staff entienda. */
function traducir(message: string): string {
  if (/bucket not found/i.test(message)) {
    return "Falta correr la migración v39 (no existe el espacio de comprobantes).";
  }
  if (/row-level security|unauthorized|not authorized/i.test(message)) {
    return "Tu usuario no tiene permiso para guardar comprobantes.";
  }
  return message;
}

/**
 * Sube el comprobante y devuelve su RUTA. Las imágenes se achican a 1600 px
 * (alcanza para leer montos y números de operación); el PDF va tal cual.
 * La carpeta es el mes, sólo para que el bucket se pueda recorrer a mano.
 */
export async function uploadComprobante(
  file: File
): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const pdf = file.type === "application/pdf";
    const blob = pdf ? file : await compressImageToBlob(file, 1600, 0.85);
    const mes = new Date().toISOString().slice(0, 7);
    const nombre = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${pdf ? "pdf" : "jpg"}`;
    const path = `${mes}/${nombre}`;
    const { error } = await supabase.storage
      .from(COMPROBANTES_BUCKET)
      .upload(path, blob, { contentType: pdf ? "application/pdf" : "image/jpeg", upsert: false });
    if (error) return { ok: false, error: traducir(error.message) };
    return { ok: true, path };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Borra el archivo. Best-effort: un archivo huérfano no rompe nada. */
export async function removeComprobante(path: string): Promise<void> {
  try {
    await supabase.storage.from(COMPROBANTES_BUCKET).remove([path]);
  } catch {
    /* ignoramos errores de borrado del archivo */
  }
}

/** URL firmada temporal: la única forma de abrir un comprobante. */
export async function getComprobanteUrl(
  path: string,
  expiresInSeconds = 300
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { data, error } = await supabase.storage
    .from(COMPROBANTES_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) {
    return { ok: false, error: traducir(error?.message ?? "No se pudo abrir el comprobante") };
  }
  return { ok: true, url: data.signedUrl };
}
