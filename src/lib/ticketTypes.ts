import { supabase } from "@/lib/supabase";

/**
 * Tipos de entrada (General, VIP, Backstage…) y su precio en cada evento.
 *
 *   ticket_types       → catálogo, se administra desde la pestaña "Entradas"
 *   event_ticket_types → qué vende cada evento y a cuánto
 *
 * Lectura pública (el comprador necesita ver tipos y precios); escritura sólo
 * admin vía RLS. Ver supabase/v15_ticket_types.sql.
 */

export interface TicketType {
  id: string;
  name: string;
  /** Qué incluye. Se le muestra al comprador debajo del nombre. */
  description?: string;
  sortOrder: number;
  active: boolean;
  createdAt: string;
}

export interface TicketTypeInput {
  name: string;
  description?: string | null;
  sortOrder?: number;
  active?: boolean;
}

/** Un tipo de entrada tal como lo vende un evento (con su precio). */
export interface EventTicket {
  ticketTypeId: string;
  name: string;
  description?: string;
  price: number;
  active: boolean;
  sortOrder: number;
}

function typeFromDb(row: any): TicketType {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    sortOrder: row.sort_order ?? 0,
    active: row.active,
    createdAt: row.created_at,
  };
}

function typeToDb(input: Partial<TicketTypeInput>): Record<string, any> {
  const out: Record<string, any> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.description !== undefined) out.description = input.description || null;
  if (input.sortOrder !== undefined) out.sort_order = input.sortOrder;
  if (input.active !== undefined) out.active = input.active;
  return out;
}

/**
 * Fila de event_ticket_types con el catálogo embebido (`ticket_types(*)`), tal
 * como la devuelve la consulta de eventos.
 */
export function eventTicketFromDb(row: any): EventTicket {
  const type = Array.isArray(row.ticket_types) ? row.ticket_types[0] : row.ticket_types;
  return {
    ticketTypeId: row.ticket_type_id,
    name: type?.name ?? "Entrada",
    description: type?.description ?? undefined,
    price: Number(row.price),
    active: row.active,
    sortOrder: row.sort_order ?? 0,
  };
}

/** Orden de presentación: el orden configurado y, a igualdad, por precio. */
export function sortEventTickets(tickets: EventTicket[]): EventTicket[] {
  return tickets
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder || a.price - b.price || a.name.localeCompare(b.name));
}

function humanError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Ya existe un tipo de entrada con ese nombre";
  if (error.code === "23503")
    return "No se puede borrar: hay eventos vendiendo este tipo. Desactivalo en vez de borrarlo.";
  return error.message;
}

// ─── Catálogo ───────────────────────────────────────────────────────────────

export async function fetchTicketTypes(): Promise<TicketType[]> {
  const { data, error } = await supabase
    .from("ticket_types")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error || !data) return [];
  return data.map(typeFromDb);
}

export async function createTicketType(
  input: TicketTypeInput
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("ticket_types").insert(typeToDb(input));
  if (error) return { ok: false, error: humanError(error) };
  return { ok: true };
}

export async function updateTicketType(
  id: string,
  patch: Partial<TicketTypeInput>
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("ticket_types").update(typeToDb(patch)).eq("id", id);
  if (error) return { ok: false, error: humanError(error) };
  return { ok: true };
}

export async function deleteTicketType(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("ticket_types").delete().eq("id", id);
  if (error) return { ok: false, error: humanError(error) };
  return { ok: true };
}

// ─── Tipos vendidos por un evento ───────────────────────────────────────────

/**
 * Reemplaza el conjunto de tipos que vende un evento por el que se pasa.
 * Borra los que se sacaron y hace upsert del resto en una sola ida y vuelta
 * cada uno: son 2 o 3 filas por evento, no vale la pena una RPC.
 */
export async function saveEventTickets(
  eventId: string,
  tickets: EventTicket[]
): Promise<{ ok: boolean; error?: string }> {
  const keep = tickets.map((t) => t.ticketTypeId);

  // 1) Fuera los tipos que el evento ya no vende.
  const del = supabase.from("event_ticket_types").delete().eq("event_id", eventId);
  const { error: delError } = keep.length
    ? await del.not("ticket_type_id", "in", `(${keep.map((id) => `"${id}"`).join(",")})`)
    : await del;
  if (delError) return { ok: false, error: humanError(delError) };

  if (!keep.length) return { ok: true };

  // 2) Alta o actualización de los vigentes.
  const { error } = await supabase.from("event_ticket_types").upsert(
    tickets.map((t, i) => ({
      event_id: eventId,
      ticket_type_id: t.ticketTypeId,
      price: t.price,
      active: t.active,
      sort_order: t.sortOrder || i + 1,
    })),
    { onConflict: "event_id,ticket_type_id" }
  );
  if (error) return { ok: false, error: humanError(error) };
  return { ok: true };
}
