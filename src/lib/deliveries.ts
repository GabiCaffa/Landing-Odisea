import { supabase } from "@/lib/supabase";

/**
 * Entregas de entradas: clientes cargados a mano a los que hay que enviarles
 * (o ya se les envió) las entradas por mail, agrupados por evento. No tiene
 * nada que ver con los perfiles de usuarios (tabla public.ticket_deliveries,
 * sólo admin vía RLS). Ver supabase/v9_ticket_deliveries.sql.
 */

export type DeliveryStatus = "pending" | "sent";

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
  status: DeliveryStatus;
  sentAt?: string;
  notes?: string;
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
    status: row.status,
    sentAt: row.sent_at ?? undefined,
    notes: row.notes ?? undefined,
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
  return out;
}

export async function fetchDeliveries(): Promise<TicketDelivery[]> {
  const { data, error } = await supabase
    .from("ticket_deliveries")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(fromDb);
}

export async function createDelivery(
  input: DeliveryInput
): Promise<{ ok: boolean; error?: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const row = { ...toDb(input), created_by: auth.user?.id ?? null };
  const { error } = await supabase.from("ticket_deliveries").insert(row);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateDelivery(
  id: string,
  patch: Partial<DeliveryInput>
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("ticket_deliveries")
    .update(toDb(patch))
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteDelivery(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("ticket_deliveries").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Marca una entrega como enviada (sella sent_at) o la devuelve a pendiente. */
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
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
