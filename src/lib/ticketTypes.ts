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
  /**
   * v28: vale para **todos los días** de una fiesta de varios días, no para
   * una fecha. El precio sigue viviendo en `event_ticket_types` como el de
   * cualquier otro tipo: esto sólo dice qué significa.
   */
  isAbono: boolean;
  createdAt: string;
}

export interface TicketTypeInput {
  name: string;
  description?: string | null;
  sortOrder?: number;
  active?: boolean;
  /** v28: vale para todos los días de la fiesta. */
  isAbono?: boolean;
}

/** Un tipo de entrada tal como lo vende un evento (con su precio). */
export interface EventTicket {
  ticketTypeId: string;
  name: string;
  description?: string;
  price: number;
  active: boolean;
  sortOrder: number;
  /** v28: viene del catálogo, no de la relación. Vale para todos los días. */
  isAbono?: boolean;
  /**
   * v29: cuántas entradas quedan de este lote antes del cambio. Lo carga el
   * staff a mano y se muestra tal cual, así que tiene que ser verdadero.
   * `undefined` = nunca informado o columna todavía sin migrar; `null` = el
   * staff lo vació (se manda NULL a la base). Ninguno de los dos se muestra.
   */
  stockRemaining?: number | null;
  /**
   * v43: cuántas entradas tiene este lote en total. Con esto cargado, lo que
   * queda se cuenta SOLO con las ventas confirmadas (`quedan`) y el número
   * manual de arriba deja de usarse. `null` = el staff lo vació.
   */
  loteCupo?: number | null;
  /** v43: lo que queda del lote según `stock_lotes()`. Sólo si hay `loteCupo`. */
  quedan?: number;
}

/** El lote tiene cupo automático y ya se vendió entero. */
export const loteAgotado = (t: EventTicket): boolean =>
  t.loteCupo !== undefined && t.loteCupo !== null && t.quedan === 0;

/** Algún tipo a la venta lleva el cupo automático (v43). */
export const stockEsAutomatico = (tickets: EventTicket[]): boolean =>
  tickets.some((t) => t.active && t.loteCupo !== undefined && t.loteCupo !== null);

/**
 * Cuántas entradas quedan antes del cambio de lote, o `undefined` si no hay
 * nada que mostrar.
 *
 * Mira sólo las entradas a la venta y toma **la que menos queda**: si hay dos
 * tipos con stock cargado, lo urgente es el que se acaba primero. Un 0 no
 * cuenta: un lote sin entradas se apaga con "A la venta" o, con cupo
 * automático, se muestra "Agotado" en su fila, no con un cartel de cero.
 *
 * Con cupo (v43) cuenta lo que queda de verdad; sin cupo, el número manual.
 */
export function stockDelLote(tickets: EventTicket[]): number | undefined {
  const cantidades = tickets
    .filter((t) => t.active)
    .map((t) => (t.loteCupo !== undefined && t.loteCupo !== null ? t.quedan : t.stockRemaining))
    .filter((n): n is number => typeof n === "number" && n > 0);
  return cantidades.length ? Math.min(...cantidades) : undefined;
}

/** "Quedan 50 entradas antes del cambio de lote" / "Queda 1 entrada…". */
export const textoStockLote = (n: number): string =>
  `${n === 1 ? "Queda 1 entrada" : `Quedan ${n} entradas`} antes del cambio de lote`;

function typeFromDb(row: any): TicketType {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    sortOrder: row.sort_order ?? 0,
    active: row.active,
    isAbono: row.is_abono ?? false,
    createdAt: row.created_at,
  };
}

function typeToDb(input: Partial<TicketTypeInput>): Record<string, any> {
  const out: Record<string, any> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.description !== undefined) out.description = input.description || null;
  if (input.sortOrder !== undefined) out.sort_order = input.sortOrder;
  if (input.isAbono !== undefined) out.is_abono = input.isAbono;
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
    isAbono: type?.is_abono ?? false,
    price: Number(row.price),
    active: row.active,
    sortOrder: row.sort_order ?? 0,
    stockRemaining: row.stock_remaining ?? undefined,
    loteCupo: row.lote_cupo ?? undefined,
  };
}

/**
 * Lo que queda de cada lote con cupo (v43), por evento y tipo. Lo vendido sale
 * de las ventas, que el público no puede leer: por eso es una RPC que devuelve
 * sólo el número. Si falla (o v43 no está corrida), `null` y no se muestra nada.
 */
export async function fetchStockLotes(): Promise<Map<string, number> | null> {
  const { data, error } = await supabase.rpc("stock_lotes");
  if (error || !data) return null;
  const out = new Map<string, number>();
  for (const row of data as Array<{ event_id: string; ticket_type_id: string; quedan: number }>) {
    out.set(`${row.event_id}:${row.ticket_type_id}`, row.quedan);
  }
  return out;
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
  if (error.code === "42703" || error.code === "PGRST204")
    return /lote_cupo/.test(error.message)
      ? "Falta correr la migración v43 en Supabase para el cupo del lote."
      : "Falta correr la migración v29_ticket_stock.sql en Supabase.";
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
      // Sólo si hay algo que decir: con la columna todavía sin migrar (v29) un
      // campo desconocido haría fallar el guardado de CUALQUIER evento.
      ...(t.stockRemaining !== undefined ? { stock_remaining: t.stockRemaining } : {}),
      // Mismo criterio para el cupo (v43): sin migrar, no se manda.
      ...(t.loteCupo !== undefined ? { lote_cupo: t.loteCupo } : {}),
    })),
    { onConflict: "event_id,ticket_type_id" }
  );
  if (error) return { ok: false, error: humanError(error) };
  return { ok: true };
}
