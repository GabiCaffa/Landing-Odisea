import { supabase } from "@/lib/supabase";
import { TicketType, fetchTicketTypes } from "@/lib/ticketTypes";

/**
 * Lotes (tandas) de una entrada.
 *
 * **Un lote es un tipo de entrada del catálogo** con el nombre de su entrada base
 * y el número: "General" es el 1er lote, "General – 2do lote" el segundo, etc. Así
 * no hace falta una tabla nueva ni tocar la compra, el stock o las ventas: cada
 * lote tiene su precio, su "A la venta" y su cupo en `event_ticket_types`, y las
 * ventas ya hechas siguen apuntando al lote en el que se compraron.
 *
 * El panel los muestra adentro de la tarjeta de su entrada base, con un botón
 * "+ Agregar lote" (ver `TicketsEditor`).
 */

const ORDINALES = ["", "1er", "2do", "3er", "4to", "5to", "6to", "7mo", "8vo", "9no", "10mo"];
const ordinal = (n: number) => ORDINALES[n] ?? `${n}º`;

const RE_LOTE = /^(.*?)\s*[–—-]\s*(\d+)\s*(?:er|ro|do|to|vo|mo|no|º|°|ª)?\s*lote\s*$/i;

/** "General – 2do lote" → { base: "General", numero: 2 }; "General" → { base: "General", numero: 1 }. */
export const parteDeLote = (nombre: string): { base: string; numero: number } => {
  const m = nombre.match(RE_LOTE);
  return m ? { base: m[1].trim(), numero: Number(m[2]) } : { base: nombre.trim(), numero: 1 };
};

/** ("General", 2) → "General – 2do lote". El 1er lote es la entrada a secas. */
export const nombreDeLote = (base: string, numero: number): string =>
  numero <= 1 ? base : `${base} – ${ordinal(numero)} lote`;

export const mismoNombre = (a: string, b: string) =>
  a.trim().toLowerCase().replace(/\s+/g, " ") === b.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * El tipo del catálogo para un lote: si ya existe con ese nombre se reutiliza (el
 * "General – 2do lote" de otra fecha sirve igual: el precio es de cada evento); si
 * no, se crea. Se lee el catálogo fresco porque el nombre es único y el que tiene
 * la pantalla puede estar viejo.
 */
export async function tipoParaLote(
  nombre: string,
  molde: { description?: string; isAbono?: boolean; sortOrder?: number }
): Promise<TicketType> {
  const catalogo = await fetchTicketTypes();
  const existente = catalogo.find((t) => mismoNombre(t.name, nombre));
  if (existente) return existente;

  const { data, error } = await supabase
    .from("ticket_types")
    .insert({
      name: nombre,
      description: molde.description || null,
      sort_order: Math.max(0, ...catalogo.map((t) => t.sortOrder)) + 1,
      is_abono: !!molde.isAbono,
      active: true,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "No se pudo crear el lote.");
  return {
    id: data.id,
    name: data.name,
    description: data.description ?? undefined,
    sortOrder: data.sort_order ?? 0,
    active: data.active,
    isAbono: !!data.is_abono,
    createdAt: data.created_at,
  };
}
