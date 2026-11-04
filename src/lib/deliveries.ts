import { supabase } from "@/lib/supabase";

/**
 * Entregas de entradas: clientes cargados a mano a los que hay que enviarles
 * (o ya se les envió) las entradas por mail, agrupados por evento. No tiene
 * nada que ver con los perfiles de usuarios (tabla public.ticket_deliveries,
 * sólo admin vía RLS). Ver supabase/v9_ticket_deliveries.sql.
 */

/**
 * Estados de una venta (v40). `pending` y `sent` son los de siempre (v9);
 * `por_confirmar` y `vencido` son de los pedidos que registra la web.
 *
 * - `por_confirmar`: el cliente tocó "Enviar" en la web. NO es una venta:
 *   nadie vio el comprobante.
 * - `pending`: "pendiente de enviar". El staff vio el comprobante.
 * - `sent`: se mandaron las entradas.
 * - `vencido`: lo usaba el vencimiento a las 48 hs, que se sacó en v41. Queda
 *   por si hay filas viejas; ninguna pasa sola a este estado.
 */
export type DeliveryStatus = "por_confirmar" | "pending" | "sent" | "vencido";

export const ESTADO_LABEL: Record<DeliveryStatus, string> = {
  por_confirmar: "Por confirmar",
  pending: "Por enviar",
  sent: "Enviada",
  vencido: "Vencido",
};

/**
 * Venta confirmada: el pago se vio. Es lo único que cuenta como recaudación,
 * como "ya compró" en la ficha de un usuario y para los cupos de promo.
 */
export const esConfirmada = (d: { status: DeliveryStatus }) =>
  d.status === "pending" || d.status === "sent";

/**
 * Una línea del desglose: qué tipo de entrada compró y a qué precio (v18).
 * `unitPrice` es lo que se cobró en su momento, no el precio de hoy.
 */
export interface DeliveryTicketLine {
  ticketTypeId: string;
  /** Nombre del catálogo, embebido para no resolverlo en cada pantalla. */
  name: string;
  quantity: number;
  unitPrice: number;
  /**
   * Promo del catálogo que se aplicó en esta línea (v24). Es lo que cuenta
   * para el cupo de la promo: una venta cargada sin esto no descuenta cupo.
   */
  promoId?: string;
  /** Nombre de esa promo, embebido (`ticket_promos(name)`). */
  promoName?: string;
}

export interface TicketDelivery {
  id: string;
  eventId: string;
  /** Si la compra es de un usuario registrado, su id de perfil. null si es manual. */
  userId?: string;
  firstName: string;
  lastName: string;
  birthDate?: string;
  country?: string;
  state?: string;
  documentId?: string;
  phone?: string; // E.164
  email: string;
  quantity: number;
  value: number; // total pagado
  /** Desglose por tipo de entrada. Vacío en las entregas cargadas antes de v18. */
  tickets: DeliveryTicketLine[];
  status: DeliveryStatus;
  sentAt?: string;
  notes?: string;
  /** Ruta del comprobante en el bucket privado `comprobantes` (v39). */
  receiptPath?: string;
  /** SHA-256 del archivo del comprobante, para avisar si se carga dos veces (v39). */
  receiptHash?: string;
  /** Número de pedido de la web ("K7Q2XM", v40). */
  orderCode?: string;
  /** `web` = lo registró el sitio; `manual` = lo cargó el staff (v40). */
  origin: "manual" | "web";
  createdAt: string;
}

/** Campos editables al crear/actualizar una entrega. */
export interface DeliveryInput {
  eventId: string;
  userId?: string | null;
  firstName: string;
  lastName: string;
  birthDate?: string | null;
  country?: string | null;
  state?: string | null;
  documentId?: string | null;
  phone?: string | null;
  email: string;
  quantity: number;
  value: number;
  notes?: string | null;
  /**
   * Comprobante (v39). `undefined` = no tocar; `null` = quitarlo. Sólo se manda
   * a la base cuando viene, así que sin la migración corrida todo lo demás
   * sigue guardándose (mismo criterio que `stock_remaining` en v29).
   */
  receiptPath?: string | null;
  receiptHash?: string | null;
}

/** Fila de delivery_ticket_types con el catálogo embebido (`ticket_types(name)`). */
function lineFromDb(row: any): DeliveryTicketLine {
  const type = Array.isArray(row.ticket_types) ? row.ticket_types[0] : row.ticket_types;
  return {
    ticketTypeId: row.ticket_type_id,
    name: type?.name ?? "Entrada",
    quantity: row.quantity,
    unitPrice: Number(row.unit_price),
    promoId: row.promo_id ?? undefined,
    promoName:
      (Array.isArray(row.ticket_promos) ? row.ticket_promos[0] : row.ticket_promos)?.name ??
      undefined,
  };
}

function fromDb(row: any): TicketDelivery {
  return {
    id: row.id,
    eventId: row.event_id,
    userId: row.user_id ?? undefined,
    firstName: row.first_name,
    lastName: row.last_name,
    birthDate: row.birth_date ?? undefined,
    country: row.country ?? undefined,
    state: row.state ?? undefined,
    documentId: row.document_id ?? undefined,
    phone: row.phone ?? undefined,
    email: row.email,
    quantity: row.quantity,
    value: Number(row.value),
    tickets: (row.delivery_ticket_types ?? []).map(lineFromDb),
    status: row.status,
    sentAt: row.sent_at ?? undefined,
    notes: row.notes ?? undefined,
    receiptPath: row.receipt_path ?? undefined,
    receiptHash: row.receipt_hash ?? undefined,
    orderCode: row.order_code ?? undefined,
    // Sin v40 la columna no existe: todo lo cargado hasta ahí es manual.
    origin: row.origin === "web" ? "web" : "manual",
    createdAt: row.created_at,
  };
}

function toDb(input: Partial<DeliveryInput>): Record<string, any> {
  const out: Record<string, any> = {};
  if (input.eventId !== undefined) out.event_id = input.eventId;
  if (input.userId !== undefined) out.user_id = input.userId || null;
  if (input.firstName !== undefined) out.first_name = input.firstName;
  if (input.lastName !== undefined) out.last_name = input.lastName;
  if (input.birthDate !== undefined) out.birth_date = input.birthDate || null;
  if (input.country !== undefined) out.country = input.country || null;
  if (input.state !== undefined) out.state = input.state || null;
  if (input.documentId !== undefined) out.document_id = input.documentId || null;
  if (input.phone !== undefined) out.phone = input.phone || null;
  if (input.email !== undefined) out.email = input.email;
  if (input.quantity !== undefined) out.quantity = input.quantity;
  if (input.value !== undefined) out.value = input.value;
  if (input.notes !== undefined) out.notes = input.notes || null;
  if (input.receiptPath !== undefined) out.receipt_path = input.receiptPath || null;
  if (input.receiptHash !== undefined) out.receipt_hash = input.receiptHash || null;
  return out;
}

/** Sin la migración v39, la base no conoce las columnas del comprobante. */
function traducirError(message: string): string {
  if (/receipt_(path|hash)/i.test(message)) {
    return "Falta correr la migración v39 para guardar el comprobante.";
  }
  return message;
}

/**
 * **Si la consulta falla, TIRA; no devuelve una lista vacía.** Antes devolvía
 * `[]`, y en producción faltó la tabla de v18 durante semanas: el embed de
 * abajo fallaba y la pestaña Entregas se veía vacía, igual que un evento sin
 * ventas. "No hay entregas" y "no pude leer las entregas" no pueden verse
 * igual.
 */
export async function fetchDeliveries(): Promise<TicketDelivery[]> {
  const { data, error } = await supabase
    .from("ticket_deliveries")
    // El desglose por tipo viene embebido (v18): son 1 o 2 filas por entrega y
    // se muestran en la misma lista, no vale la pena una segunda consulta.
    .select("*, delivery_ticket_types(*, ticket_types(name), ticket_promos(name))")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(fromDb);
}

/**
 * Crea la entrega y devuelve su id: el desglose por tipo de entrada se guarda
 * después, en su propia tabla (mismo patrón que `createEvent` con v15).
 */
export async function createDelivery(
  input: DeliveryInput
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const row = { ...toDb(input), created_by: auth.user?.id ?? null };
  const { data, error } = await supabase
    .from("ticket_deliveries")
    .insert(row)
    .select("id")
    .single();
  if (error) return { ok: false, error: traducirError(error.message) };
  return { ok: true, id: data?.id };
}

/**
 * Crea la venta Y su desglose, que es lo que hace el botón "Guardar" de
 * "Pegar mensaje" sin pasar por el formulario. Si la venta se crea y el
 * desglose falla, lo dice: la venta ya existe y no hay que cargarla de nuevo.
 */
export async function createDeliveryWithTickets(
  input: DeliveryInput,
  lines: DeliveryTicketLine[]
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const created = await createDelivery(input);
  if (!created.ok || !created.id) return created;
  const tickets = await saveDeliveryTickets(created.id, lines);
  if (!tickets.ok) {
    return {
      ok: false,
      id: created.id,
      error: `Se guardó la venta, pero no el tipo de entrada: ${tickets.error}. Editala para completarlo.`,
    };
  }
  return created;
}

/**
 * Reemplaza el desglose de una entrega por el que se pasa: borra los tipos que
 * salieron y hace upsert del resto (molde de `saveEventTickets`).
 */
export async function saveDeliveryTickets(
  deliveryId: string,
  lines: DeliveryTicketLine[]
): Promise<{ ok: boolean; error?: string }> {
  const keep = lines.filter((l) => l.quantity > 0);
  const keepIds = keep.map((l) => l.ticketTypeId);

  const del = supabase.from("delivery_ticket_types").delete().eq("delivery_id", deliveryId);
  const { error: delError } = keepIds.length
    ? await del.not("ticket_type_id", "in", `(${keepIds.map((id) => `"${id}"`).join(",")})`)
    : await del;
  if (delError) return { ok: false, error: delError.message };

  if (!keep.length) return { ok: true };

  const { error } = await supabase.from("delivery_ticket_types").upsert(
    keep.map((l) => ({
      delivery_id: deliveryId,
      ticket_type_id: l.ticketTypeId,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      promo_id: l.promoId ?? null,
    })),
    { onConflict: "delivery_id,ticket_type_id" }
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Resumen legible del desglose: "2 General (2x1) · 1 VIP". */
export function ticketsSummary(lines: DeliveryTicketLine[]): string {
  return lines
    .map((l) => `${l.quantity} ${l.name}${l.promoName ? ` (${l.promoName})` : ""}`)
    .join(" · ");
}

export async function updateDelivery(
  id: string,
  patch: Partial<DeliveryInput>
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("ticket_deliveries")
    .update(toDb(patch))
    .eq("id", id);
  if (error) return { ok: false, error: traducirError(error.message) };
  return { ok: true };
}

export async function deleteDelivery(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("ticket_deliveries").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Sin la migración v40, la base no conoce los estados nuevos. */
function errorDeEstado(message: string): string {
  if (/status_check|por_confirmar|vencido/i.test(message)) {
    return "Falta correr la migración v40 para los estados de las ventas.";
  }
  return message;
}

/**
 * Cambia el estado de una venta. Con v40 la base sella `sent_at` y
 * `confirmed_at` sola, y rechaza marcar como enviado un pedido sin confirmar.
 */
export async function setDeliveryStatus(
  id: string,
  status: DeliveryStatus
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("ticket_deliveries")
    .update({
      status,
      sent_at: status === "sent" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: errorDeEstado(error.message) };
  return { ok: true };
}

/**
 * Llegó el comprobante de un pedido de la web: pasa a "por enviar" con los
 * datos del mensaje y el comprobante (v40). Es UNA sola escritura, así no
 * puede quedar confirmado sin comprobante ni con comprobante sin confirmar.
 */
export async function confirmarPedido(
  id: string,
  patch: Partial<DeliveryInput>,
  lines?: DeliveryTicketLine[]
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("ticket_deliveries")
    .update({ ...toDb(patch), status: "pending" })
    .eq("id", id);
  if (error) return { ok: false, error: errorDeEstado(traducirError(error.message)) };
  if (lines?.length) {
    const tickets = await saveDeliveryTickets(id, lines);
    if (!tickets.ok) {
      return {
        ok: false,
        error: `Se confirmó el pedido, pero no el tipo de entrada: ${tickets.error}. Editalo para completarlo.`,
      };
    }
  }
  return { ok: true };
}
