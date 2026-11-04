import type { DeliveryTicketLine, TicketDelivery } from "@/lib/deliveries";
import { foldText } from "@/lib/utils";

/**
 * Controles antes de guardar una venta pegada desde WhatsApp.
 *
 * **Ninguno bloquea.** Avisan, y el staff decide. Hay dos niveles porque el
 * caso más común de "repetido" NO es un error: una misma persona compra para
 * Halloween Colonia hoy y vuelve a comprar la semana que viene. El aviso viejo
 * (mismo email + mismo evento) saltaba justo ahí y a fuerza de verlo dejaba de
 * leerse. Ahora se separa:
 *
 * - **fuerte** — casi seguro es la MISMA compra cargada dos veces: el mismo
 *   archivo de comprobante, o misma persona con la misma cantidad y el mismo
 *   total en las últimas 48 h.
 * - **aviso** — la persona ya compró para ese evento, pero algo cambia
 *   (cantidad, total o pasó tiempo): lo normal es que sea otra compra.
 *
 * Archivo aparte y sin imports de Supabase para poder probarlo con node
 * (`scripts/probar-carga-ventas.mjs`).
 */

export type NivelAviso = "fuerte" | "aviso";

export interface AvisoVenta {
  nivel: NivelAviso;
  texto: string;
}

export interface VentaCandidata {
  eventId: string;
  email?: string | null;
  /** E.164. */
  phone?: string | null;
  quantity: number;
  value: number | null;
  receiptHash?: string | null;
  /**
   * El pedido de la web que esta venta viene a confirmar (v40). No se compara
   * contra sí mismo: sería avisar que la venta está repetida con su propio pedido.
   */
  excluirId?: string | null;
}

/** Ventana en la que "misma persona, misma cantidad, mismo total" es la misma compra. */
export const HORAS_MISMA_COMPRA = 48;

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-UY", {
    timeZone: "America/Montevideo",
    day: "2-digit",
    month: "2-digit",
  });

const nombreDe = (d: TicketDelivery) => `${d.firstName} ${d.lastName}`.trim();

const entradas = (n: number) => `${n} entrada${n === 1 ? "" : "s"}`;

// Escrito acá y no importado de deliveries.ts: ese archivo trae Supabase, y
// éste se prueba con node.
const ESTADOS: Record<TicketDelivery["status"], string> = {
  por_confirmar: "pedido sin confirmar",
  pending: "por enviar",
  sent: "ya enviada",
  vencido: "pedido vencido",
};
const estadoDe = (d: TicketDelivery) => ESTADOS[d.status] ?? d.status;

function hace(iso: string, ahora: Date): string {
  const horas = Math.max(0, (ahora.getTime() - new Date(iso).getTime()) / 3_600_000);
  if (horas < 1) return "hace menos de una hora";
  if (horas < 24) return `hace ${Math.floor(horas)} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} día${dias === 1 ? "" : "s"}`;
}

export function revisarDuplicados(
  candidata: VentaCandidata,
  existentes: TicketDelivery[],
  opciones: { ahora?: Date; nombreEvento?: (eventId: string) => string } = {}
): AvisoVenta[] {
  const ahora = opciones.ahora ?? new Date();
  const evento = (id: string) => opciones.nombreEvento?.(id) ?? "otro evento";
  const email = candidata.email?.trim().toLowerCase() || null;
  const phone = candidata.phone?.trim() || null;

  const fuertes: AvisoVenta[] = [];
  const avisos: AvisoVenta[] = [];
  // Una venta existente genera UN solo aviso, el más fuerte que le toque.
  const vistas = new Set<string>();
  if (candidata.excluirId) vistas.add(candidata.excluirId);

  if (candidata.receiptHash) {
    for (const d of existentes) {
      if (vistas.has(d.id) || d.receiptHash !== candidata.receiptHash) continue;
      vistas.add(d.id);
      const dondeEsta = d.eventId === candidata.eventId ? "este evento" : evento(d.eventId);
      fuertes.push({
        nivel: "fuerte",
        texto: `Este comprobante ya está cargado: ${nombreDe(d)}, ${entradas(d.quantity)} para ${dondeEsta}, el ${fechaCorta(d.createdAt)} (${estadoDe(d)}).`,
      });
    }
  }

  for (const d of existentes) {
    if (vistas.has(d.id) || d.eventId !== candidata.eventId) continue;
    const mismoEmail = !!email && d.email.trim().toLowerCase() === email;
    const mismoTel = !!phone && d.phone === phone;
    if (!mismoEmail && !mismoTel) continue;

    const horas = (ahora.getTime() - new Date(d.createdAt).getTime()) / 3_600_000;
    const mismaCompra =
      d.quantity === candidata.quantity &&
      candidata.value !== null &&
      Math.abs(d.value - candidata.value) < 0.01 &&
      horas <= HORAS_MISMA_COMPRA;

    if (mismaCompra) {
      fuertes.push({
        nivel: "fuerte",
        texto: `Parece la misma compra: ${nombreDe(d)} ya tiene ${entradas(d.quantity)} por $${d.value} para este evento, cargada ${hace(d.createdAt, ahora)} (${estadoDe(d)}).`,
      });
    } else {
      avisos.push({
        nivel: "aviso",
        texto: `${nombreDe(d)} ya compró ${entradas(d.quantity)} para este evento el ${fechaCorta(d.createdAt)} (${estadoDe(d)}). Si es otra compra, cargala igual.`,
      });
    }
  }

  return [...fuertes, ...avisos];
}

/**
 * El precio de cada línea contra el que vende HOY el evento. Una diferencia no
 * es un error —puede ser un lote anterior, o el cliente armó el mensaje antes
 * del cambio de lote— pero es lo primero que hay que mirar en el comprobante.
 * Las líneas con promo se saltean: su precio ya viene descontado.
 */
export function revisarPrecios(
  lines: DeliveryTicketLine[],
  tickets: { ticketTypeId: string; price: number }[]
): AvisoVenta[] {
  const out: AvisoVenta[] = [];
  for (const line of lines) {
    if (line.promoId) continue;
    const hoy = tickets.find((t) => t.ticketTypeId === line.ticketTypeId);
    if (!hoy || Math.abs(hoy.price - line.unitPrice) < 0.5) continue;
    out.push({
      nivel: "aviso",
      texto: `${line.name}: el mensaje dice $${Math.round(line.unitPrice)} c/u y hoy se vende a $${hoy.price}. ¿Es de un lote anterior?`,
    });
  }
  return out;
}

/** Hoy en Uruguay como `yyyy-mm-dd`, con los getters locales (ver §v21). */
function hoyLocal(ahora: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ahora.getFullYear()}-${p(ahora.getMonth() + 1)}-${p(ahora.getDate())}`;
}

/** El evento elegido ya pasó o está cerrado: puede ser el evento equivocado. */
export function revisarEvento(
  evento: { date: string; status: string } | null,
  ahora: Date = new Date()
): AvisoVenta[] {
  if (!evento) return [];
  if (evento.status === "finalizado") {
    return [{ nivel: "aviso", texto: "El evento figura como finalizado. ¿Es el evento correcto?" }];
  }
  if (evento.date && evento.date.slice(0, 10) < hoyLocal(ahora)) {
    return [{ nivel: "aviso", texto: "La fecha de este evento ya pasó. ¿Es el evento correcto?" }];
  }
  return [];
}

// ─── El mensaje contra el pedido de la web (v40) ────────────────────────────

/**
 * ¿El mensaje es de la persona dueña de la cuenta? El email coincide, pero eso
 * no alcanza: alguien con cuenta compra para una amiga y deja su propio email y
 * teléfono, y cambia el nombre en el WhatsApp. Se mira que el nombre del
 * mensaje contenga el primer nombre de la cuenta. Sin uno de los dos, se da por
 * buena (no hay con qué decir que no).
 */
export function mismaPersona(nombreCuenta: string | null | undefined, nombreMensaje: string | null | undefined): boolean {
  const mensaje = foldText(nombreMensaje ?? "").trim();
  const primero = foldText(nombreCuenta ?? "").trim().split(/\s+/)[0] ?? "";
  return !mensaje || !primero || mensaje.includes(primero);
}

export interface DatosDelMensaje {
  fullName: string | null;
  documentId: string | null;
  email: string | null;
  phoneE164: string | null;
  quantity: number;
  total: number | null;
}

/**
 * Qué dice distinto el mensaje respecto del pedido que guardó la web. Pasa
 * cuando el cliente edita el texto en WhatsApp antes de mandarlo (típico: la
 * entrada es para otra persona). Manda el MENSAJE: es lo último que escribió.
 */
export function cambiosDelPedido(pedido: TicketDelivery, m: DatosDelMensaje): string[] {
  const cambios: string[] = [];
  const antes = `${pedido.firstName} ${pedido.lastName}`.trim();
  const nombre = (m.fullName ?? "").trim();
  if (nombre && foldText(antes).trim() !== foldText(nombre)) cambios.push(`Nombre: ${antes} → ${nombre}`);
  if (m.documentId && m.documentId !== (pedido.documentId ?? ""))
    cambios.push(`Documento: ${pedido.documentId || "—"} → ${m.documentId}`);
  if (m.email && m.email.toLowerCase() !== pedido.email.toLowerCase()) cambios.push(`Email: ${pedido.email} → ${m.email}`);
  if (m.phoneE164 && m.phoneE164 !== pedido.phone) cambios.push(`Teléfono: ${pedido.phone ?? "—"} → ${m.phoneE164}`);
  if (m.quantity && m.quantity !== pedido.quantity) cambios.push(`Entradas: ${pedido.quantity} → ${m.quantity}`);
  if (m.total !== null && Math.abs(m.total - pedido.value) > 0.01) cambios.push(`Total: $${pedido.value} → $${m.total}`);
  return cambios;
}
