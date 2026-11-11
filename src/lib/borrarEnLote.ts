import { supabase, COMPROBANTES_BUCKET, ID_PHOTOS_BUCKET } from "@/lib/supabase";

/**
 * Borrar muchas filas de una (selección múltiple en Entregas y Cumpleaños).
 *
 * De a tandas de 100: un `.in("id", [...])` con miles de ids arma una URL que
 * el servidor rechaza. Se pide `.select("id")` para saber cuántas se borraron
 * DE VERDAD: si la base no deja borrar alguna (RLS), no da error, simplemente
 * no la borra, y decir "se borraron 40" cuando fueron 0 sería mentir.
 *
 * Los archivos (comprobantes, fotos de cédula) se borran DESPUÉS y sólo los de
 * las filas que se borraron: un archivo que queda huérfano no rompe nada, una
 * venta sin su comprobante sí. Mismo criterio que `deleteBirthday` (v17).
 */
const TANDA = 100;

async function borrarFilas(tabla: string, ids: string[]): Promise<{ borradas: Set<string>; error?: string }> {
  const borradas = new Set<string>();
  for (let i = 0; i < ids.length; i += TANDA) {
    const { data, error } = await supabase
      .from(tabla)
      .delete()
      .in("id", ids.slice(i, i + TANDA))
      .select("id");
    if (error) return { borradas, error: error.message };
    for (const r of data ?? []) borradas.add((r as { id: string }).id);
  }
  return { borradas };
}

async function borrarArchivos(bucket: string, rutas: string[]): Promise<void> {
  for (let i = 0; i < rutas.length; i += TANDA) {
    try {
      await supabase.storage.from(bucket).remove(rutas.slice(i, i + TANDA));
    } catch {
      // Best-effort: un archivo huérfano no rompe nada.
    }
  }
}

export interface ResultadoLote {
  borradas: number;
  pedidas: number;
  error?: string;
}

/** Ventas con todos sus comprobantes (v45). `rutasDe` da las rutas de cada una. */
export async function borrarVentas(
  ventas: { id: string }[],
  rutasDe: (id: string) => string[]
): Promise<ResultadoLote> {
  const { borradas, error } = await borrarFilas("ticket_deliveries", ventas.map((v) => v.id));
  await borrarArchivos(COMPROBANTES_BUCKET, [...borradas].flatMap(rutasDe));
  return { borradas: borradas.size, pedidas: ventas.length, error };
}

/** Cumpleañeros con la foto de su cédula. */
export async function borrarCumples(rows: { id: string; idPhotoPath?: string }[]): Promise<ResultadoLote> {
  const { borradas, error } = await borrarFilas("birthday_signups", rows.map((r) => r.id));
  const rutas = rows.filter((r) => borradas.has(r.id) && r.idPhotoPath).map((r) => r.idPhotoPath!);
  await borrarArchivos(ID_PHOTOS_BUCKET, rutas);
  return { borradas: borradas.size, pedidas: rows.length, error };
}
