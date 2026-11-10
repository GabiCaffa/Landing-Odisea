import { supabase } from "@/lib/supabase";
import { traerTodo } from "@/lib/traerTodo";
import { removeComprobante } from "@/lib/comprobantes";
import type { TicketDelivery } from "@/lib/deliveries";

/**
 * Varios comprobantes por venta, cada uno con a qué cuenta fue (v45).
 *
 * El caso que lo pidió: alguien compra la fecha equivocada, transfiere a la
 * cuenta de ese evento y después manda la diferencia — a veces a la cuenta de
 * otro. Son dos comprobantes y dos cuentas.
 *
 * El primero sigue siendo `receipt_path` (lo pega Cargar ventas o el
 * formulario, como en v39) y la base lo copia sola a `delivery_receipts`. Los
 * demás se agregan acá. **Sin la migración v45 todo sigue andando** con el
 * comprobante único de siempre: `fetchComprobantesVentas` devuelve `null` y la
 * lista se arma con `receipt_path`.
 */

export interface ComprobanteVenta {
  /** "" = el de `receipt_path` sin migrar (no tiene fila propia). */
  id: string;
  deliveryId: string;
  path: string;
  hash?: string;
  /** A qué cuenta de cobro se transfirió. */
  accountId?: string;
  createdAt: string;
}

interface FilaComprobante {
  id: string;
  delivery_id: string;
  path: string;
  hash: string | null;
  account_id: string | null;
  created_at: string;
}

const desdeFila = (r: FilaComprobante): ComprobanteVenta => ({
  id: r.id,
  deliveryId: r.delivery_id,
  path: r.path,
  hash: r.hash ?? undefined,
  accountId: r.account_id ?? undefined,
  createdAt: r.created_at,
});

const faltaMigracion = (m: string) => /delivery_receipts/i.test(m) && /(does not exist|not find|schema cache)/i.test(m);

/** Todos los comprobantes, por venta. `null` si falta correr v45. */
export async function fetchComprobantesVentas(): Promise<Map<string, ComprobanteVenta[]> | null> {
  try {
    const filas = await traerTodo<FilaComprobante>((desde, hasta) =>
      supabase
        .from("delivery_receipts")
        .select("*")
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(desde, hasta)
    );
    const porVenta = new Map<string, ComprobanteVenta[]>();
    for (const c of filas.map(desdeFila)) {
      const lista = porVenta.get(c.deliveryId) ?? [];
      lista.push(c);
      porVenta.set(c.deliveryId, lista);
    }
    return porVenta;
  } catch (e) {
    if (faltaMigracion((e as Error).message)) return null;
    throw e;
  }
}

/**
 * Los comprobantes de una venta. Con v45, los de la tabla; sin v45 (o si la
 * tabla todavía no lo tiene), el de `receipt_path`.
 */
export function comprobantesDe(
  d: Pick<TicketDelivery, "id" | "receiptPath" | "receiptHash" | "createdAt">,
  mapa: Map<string, ComprobanteVenta[]> | null
): ComprobanteVenta[] {
  const lista = mapa?.get(d.id) ?? [];
  if (d.receiptPath && !lista.some((c) => c.path === d.receiptPath)) {
    return [
      { id: "", deliveryId: d.id, path: d.receiptPath, hash: d.receiptHash, createdAt: d.createdAt },
      ...lista,
    ];
  }
  return lista;
}

/**
 * Agrega un comprobante a la venta. Si la venta no tenía ninguno, éste pasa a
 * ser el principal (`receipt_path`), así el aviso de comprobante repetido y
 * todo lo de v39 lo siguen viendo, y anda aunque falte v45.
 */
export async function agregarComprobanteVenta(
  d: Pick<TicketDelivery, "id" | "receiptPath">,
  path: string,
  hash: string | undefined,
  accountId: string | undefined
): Promise<{ ok: boolean; error?: string }> {
  if (!d.receiptPath) {
    const { error } = await supabase
      .from("ticket_deliveries")
      .update({ receipt_path: path, receipt_hash: hash ?? null })
      .eq("id", d.id);
    if (error) return { ok: false, error: error.message };
    // La fila la crea el trigger de v45 con la cuenta del evento; si se eligió
    // otra, se corrige. Sin v45 no hay fila y no pasa nada.
    if (accountId) {
      await supabase.from("delivery_receipts").update({ account_id: accountId }).eq("delivery_id", d.id).eq("path", path);
    }
    return { ok: true };
  }
  const { error } = await supabase.from("delivery_receipts").insert({
    delivery_id: d.id,
    path,
    hash: hash ?? null,
    account_id: accountId || null,
  });
  if (!error) return { ok: true };
  if (faltaMigracion(error.message)) {
    return { ok: false, error: "Falta correr la migración v45 para agregar más de un comprobante." };
  }
  return { ok: false, error: error.message };
}

export async function cambiarCuentaComprobante(
  id: string,
  accountId: string | null
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("delivery_receipts").update({ account_id: accountId }).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Quita un comprobante y borra el archivo. El primero (`receipt_path`) se saca
 * de la venta —el trigger de v45 borra su fila—; los demás, de la tabla.
 */
export async function quitarComprobanteVenta(
  d: Pick<TicketDelivery, "id" | "receiptPath">,
  c: ComprobanteVenta
): Promise<{ ok: boolean; error?: string }> {
  const { error } =
    c.path === d.receiptPath
      ? await supabase.from("ticket_deliveries").update({ receipt_path: null, receipt_hash: null }).eq("id", d.id)
      : await supabase.from("delivery_receipts").delete().eq("id", c.id);
  if (error) return { ok: false, error: error.message };
  await removeComprobante(c.path);
  return { ok: true };
}
