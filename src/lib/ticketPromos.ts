import { supabase } from "@/lib/supabase";

/**
 * Promos de entradas: 2x1, 2da al 50%, 3x2.
 *
 * **Un solo mecanismo cubre todo lo pedido**, con tres números:
 * `cada N entradas, M con X% de descuento`.
 *
 *   2x1                → cada 2, 1 al 100%
 *   2da al 50%         → cada 2, 1 al 50%
 *   3x2                → cada 3, 1 al 100%
 *   3 al precio de 1   → cada 3, 2 al 100%
 *   cada 4, 2 a mitad  → cada 4, 2 al 50%
 *
 * El tercer número existe porque con M fijo en 1 no se podía expresar "3 al
 * precio de 1" ni "cada 4, dos a mitad de precio".
 *
 * **Los tres números son INTERNOS.** El comprador ve el `name` que escribió el
 * admin ("2x1") y el precio ya descontado; nunca la fórmula. Por eso `name` se
 * escribe pensando en el cliente.
 *
 * Es un catálogo (`ticket_promos`) más una tabla de unión
 * (`event_ticket_promos`), igual que `ticket_types` ↔ `event_ticket_types`,
 * porque la misma promo se aplica a varios eventos.
 */

export interface TicketPromo {
  id: string;
  /** Lo que lee el cliente. */
  name: string;
  description?: string;
  /** Cada cuántas entradas se aplica la promo. Interno. */
  everyN: number;
  /** Cuántas de esas N se descuentan. Menor que `everyN`. Interno. */
  discountedUnits: number;
  /** Qué porcentaje se les descuenta. Interno. */
  percentOff: number;
  /** ISO yyyy-mm-dd. Sin valor = sin límite de ese lado. */
  startsAt?: string;
  endsAt?: string;
  active: boolean;
  createdAt: string;
}

/** Una promo tal como la aplica un evento, sobre un tipo de entrada. */
export interface EventPromo {
  /** Id de la fila de unión, no de la promo. */
  id: string;
  promoId: string;
  ticketTypeId: string;
  name: string;
  description?: string;
  everyN: number;
  discountedUnits: number;
  percentOff: number;
  startsAt?: string;
  endsAt?: string;
  active: boolean;
}

export interface TicketPromoInput {
  name: string;
  description?: string | null;
  everyN: number;
  discountedUnits: number;
  percentOff: number;
  startsAt?: string | null;
  endsAt?: string | null;
  active?: boolean;
}

// ─── Vigencia ───────────────────────────────────────────────────────────────

/**
 * El día de hoy como `yyyy-mm-dd`, en la zona horaria de quien mira.
 *
 * Se arma con los getters locales y **no** con `toISOString()`: ése pasa a UTC
 * y en Uruguay (UTC−3) devuelve el día siguiente desde las 21:00. Una promo que
 * vence hoy se apagaría tres horas antes de tiempo. Es el mismo motivo por el
 * que `formatEventDate` corta el string en vez de usar `new Date()`.
 */
const hoyLocal = (): string => {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
};

/** ¿La promo está activa y dentro de su ventana? Las fechas son inclusivas. */
export const promoVigente = (p: EventPromo | TicketPromo, hoy = hoyLocal()): boolean => {
  if (!p.active) return false;
  if (p.startsAt && hoy < p.startsAt) return false;
  if (p.endsAt && hoy > p.endsAt) return false;
  return true;
};

// ─── El cálculo ─────────────────────────────────────────────────────────────

export interface DescuentoAplicado {
  promo: EventPromo;
  /** Cuántas entradas se descontaron. */
  unidades: number;
  /** Cuánto se descuenta, en pesos. Siempre positivo. */
  monto: number;
}

/**
 * Cuánto descuenta una promo sobre `cantidad` entradas de precio `precio`.
 *
 * `floor(cantidad / everyN)` es cuántas veces entra la promo, y cada vez
 * descuenta `discountedUnits` entradas. Con "2da al 50%" y 4 entradas entra DOS
 * veces: si entrara una sola, la promo premiaría comprar de a dos y castigaría
 * comprar de a cuatro.
 *
 * Se redondea al peso porque los precios son enteros; `Math.round` y no `floor`
 * para no quedarnos con el medio peso a favor nuestro en cada operación.
 */
export const descuentoDe = (
  promo: EventPromo,
  precio: number,
  cantidad: number
): DescuentoAplicado | null => {
  if (!promoVigente(promo) || cantidad < promo.everyN || precio <= 0) return null;
  const veces = Math.floor(cantidad / promo.everyN);
  const unidades = veces * Math.max(1, promo.discountedUnits);
  const monto = Math.round(unidades * precio * (promo.percentOff / 100));
  if (monto <= 0) return null;
  return { promo, unidades, monto };
};

/**
 * De todas las promos cargadas para un tipo de entrada, cuál se aplica.
 *
 * **Gana la que más descuenta.** Puede haber varias vigentes sobre el mismo
 * tipo —la tabla lo permite a propósito, para poder programar una de preventa y
 * otra después—, y si dos ventanas se pisan hay que elegir. Elegir la mejor
 * para el comprador es la única regla que no necesita explicación y que nunca
 * lo perjudica. **No se acumulan**: se aplica una sola.
 */
export const mejorDescuento = (
  promos: EventPromo[],
  ticketTypeId: string,
  precio: number,
  cantidad: number
): DescuentoAplicado | null => {
  let mejor: DescuentoAplicado | null = null;
  for (const p of promos) {
    if (p.ticketTypeId !== ticketTypeId) continue;
    const d = descuentoDe(p, precio, cantidad);
    if (d && (!mejor || d.monto > mejor.monto)) mejor = d;
  }
  return mejor;
};

// ─── Acceso a datos ─────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const promoFromDb = (row: any): TicketPromo => ({
  id: row.id,
  name: row.name,
  description: row.description ?? undefined,
  everyN: row.every_n,
  discountedUnits: row.discounted_units ?? 1,
  percentOff: row.percent_off,
  startsAt: row.starts_at ?? undefined,
  endsAt: row.ends_at ?? undefined,
  active: row.active,
  createdAt: row.created_at,
});

/** Fila de unión + los datos de la promo, embebidos por la FK. */
export const eventPromoFromDb = (row: any): EventPromo => ({
  id: row.id,
  promoId: row.promo_id,
  ticketTypeId: row.ticket_type_id,
  name: row.ticket_promos?.name ?? "",
  description: row.ticket_promos?.description ?? undefined,
  everyN: row.ticket_promos?.every_n ?? 2,
  discountedUnits: row.ticket_promos?.discounted_units ?? 1,
  percentOff: row.ticket_promos?.percent_off ?? 0,
  startsAt: row.ticket_promos?.starts_at ?? undefined,
  endsAt: row.ticket_promos?.ends_at ?? undefined,
  // Una promo apagada en el catálogo se apaga en TODOS los eventos; la fila de
  // unión sólo puede apagarla en uno. Por eso hacen falta las dos.
  active: !!row.active && !!row.ticket_promos?.active,
});

const promoToDb = (input: Partial<TicketPromoInput>): Record<string, any> => {
  const out: Record<string, any> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.description !== undefined) out.description = input.description || null;
  if (input.everyN !== undefined) out.every_n = input.everyN;
  if (input.discountedUnits !== undefined) out.discounted_units = input.discountedUnits;
  if (input.percentOff !== undefined) out.percent_off = input.percentOff;
  if (input.startsAt !== undefined) out.starts_at = input.startsAt || null;
  if (input.endsAt !== undefined) out.ends_at = input.endsAt || null;
  if (input.active !== undefined) out.active = input.active;
  return out;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function fetchTicketPromos(): Promise<TicketPromo[]> {
  const { data, error } = await supabase
    .from("ticket_promos")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []).map(promoFromDb);
}

export async function createTicketPromo(
  input: TicketPromoInput
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("ticket_promos").insert(promoToDb(input));
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function updateTicketPromo(
  id: string,
  input: Partial<TicketPromoInput>
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("ticket_promos").update(promoToDb(input)).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Borra una promo del catálogo.
 *
 * La FK es `on delete restrict`, así que falla si algún evento la usa. El
 * código 23503 se traduce a un mensaje que dice qué hacer — mismo criterio que
 * las cuentas de cobro (v13), donde un "violates foreign key constraint" no le
 * sirve a nadie.
 */
export async function deleteTicketPromo(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("ticket_promos").delete().eq("id", id);
  if (!error) return { ok: true };
  if (error.code === "23503") {
    return {
      ok: false,
      error: "Hay eventos usando esta promo. Sacala de esos eventos o desactivala.",
    };
  }
  return { ok: false, error: error.message };
}

/**
 * Reemplaza las promos de un evento.
 *
 * Mismo criterio que `saveEventTickets` (v15): se borra lo que salió y se
 * inserta lo que entró, en vez de intentar un diff fino. El conjunto es chico y
 * así no queda estado a medias si algo falla.
 */
export async function saveEventPromos(
  eventId: string,
  promos: Array<{ promoId: string; ticketTypeId: string }>
): Promise<{ ok: boolean; error?: string }> {
  const { error: delError } = await supabase
    .from("event_ticket_promos")
    .delete()
    .eq("event_id", eventId);
  if (delError) return { ok: false, error: delError.message };

  if (promos.length === 0) return { ok: true };

  const { error } = await supabase.from("event_ticket_promos").insert(
    promos.map((p) => ({
      event_id: eventId,
      promo_id: p.promoId,
      ticket_type_id: p.ticketTypeId,
    }))
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}
