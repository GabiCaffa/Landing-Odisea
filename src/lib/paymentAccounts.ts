import { supabase } from "@/lib/supabase";

/**
 * Cuentas de cobro: catálogo de las cuentas bancarias a las que la gente
 * transfiere. Cada evento apunta a una (events.payment_account_id) y el modal
 * de compra muestra esos datos en vez de tenerlos hardcodeados.
 *
 * Lectura pública (el comprador necesita ver a dónde transferir); escritura
 * sólo admin vía RLS. Ver supabase/v13_payment_accounts.sql.
 */

export interface PaymentAccount {
  id: string;
  /** Nombre interno para reconocerla en el panel: "Itaú Gabriel". */
  label: string;
  holderName: string;
  bank: string;
  accountType: string;
  accountNumber: string;
  documentId?: string;
  notes?: string;
  active: boolean;
  /** Preseleccionada al crear un evento. Como máximo una. */
  isDefault: boolean;
  createdAt: string;
}

/** Campos editables al crear/actualizar una cuenta. */
export interface PaymentAccountInput {
  label: string;
  holderName: string;
  bank: string;
  accountType?: string;
  accountNumber: string;
  documentId?: string | null;
  notes?: string | null;
  active?: boolean;
  isDefault?: boolean;
}

function fromDb(row: any): PaymentAccount {
  return {
    id: row.id,
    label: row.label,
    holderName: row.holder_name,
    bank: row.bank,
    accountType: row.account_type ?? "",
    accountNumber: row.account_number,
    documentId: row.document_id ?? undefined,
    notes: row.notes ?? undefined,
    active: row.active,
    isDefault: row.is_default,
    createdAt: row.created_at,
  };
}

function toDb(input: Partial<PaymentAccountInput>): Record<string, any> {
  const out: Record<string, any> = {};
  if (input.label !== undefined) out.label = input.label;
  if (input.holderName !== undefined) out.holder_name = input.holderName;
  if (input.bank !== undefined) out.bank = input.bank;
  if (input.accountType !== undefined) out.account_type = input.accountType ?? "";
  if (input.accountNumber !== undefined) out.account_number = input.accountNumber;
  if (input.documentId !== undefined) out.document_id = input.documentId || null;
  if (input.notes !== undefined) out.notes = input.notes || null;
  if (input.active !== undefined) out.active = input.active;
  if (input.isDefault !== undefined) out.is_default = input.isDefault;
  return out;
}

/** Traduce errores de Postgres a algo que el admin pueda entender. */
function humanError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Ya existe una cuenta con ese nombre";
  if (error.code === "23503")
    return "No se puede borrar: hay eventos usando esta cuenta. Desactivala en vez de borrarla.";
  return error.message;
}

export async function fetchPaymentAccounts(): Promise<PaymentAccount[]> {
  const { data, error } = await supabase
    .from("payment_accounts")
    .select("*")
    .order("is_default", { ascending: false })
    .order("label", { ascending: true });
  if (error || !data) return [];
  return data.map(fromDb);
}

/**
 * Cuenta a la que hay que transferir para un evento. Una sola consulta: se
 * trae la cuenta embebida por la FK del evento.
 */
export async function fetchAccountForEvent(
  eventId: string
): Promise<PaymentAccount | null> {
  const { data, error } = await supabase
    .from("events")
    .select("payment_accounts(*)")
    .eq("id", eventId)
    .maybeSingle();
  if (error || !data) return null;
  // PostgREST devuelve objeto en las relaciones muchos-a-uno, pero toleramos
  // que venga como array por las dudas.
  const raw: any = (data as any).payment_accounts;
  const row = Array.isArray(raw) ? raw[0] : raw;
  return row ? fromDb(row) : null;
}

export async function createPaymentAccount(
  input: PaymentAccountInput
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("payment_accounts").insert(toDb(input));
  if (error) return { ok: false, error: humanError(error) };
  return { ok: true };
}

export async function updatePaymentAccount(
  id: string,
  patch: Partial<PaymentAccountInput>
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("payment_accounts")
    .update(toDb(patch))
    .eq("id", id);
  if (error) return { ok: false, error: humanError(error) };
  return { ok: true };
}

export async function deletePaymentAccount(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("payment_accounts").delete().eq("id", id);
  if (error) return { ok: false, error: humanError(error) };
  return { ok: true };
}

/**
 * Marca una cuenta como la preseleccionada. El trigger de la DB desmarca las
 * demás, así que alcanza con este update.
 */
export async function setDefaultAccount(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("payment_accounts")
    .update({ is_default: true, active: true })
    .eq("id", id);
  if (error) return { ok: false, error: humanError(error) };
  return { ok: true };
}

/** Línea corta para mostrarla en listas y selects: "ITAÚ · 3483509". */
export function accountSummary(a: PaymentAccount): string {
  return `${a.bank} · ${a.accountNumber}`;
}
