import { supabase } from "@/lib/supabase";

/**
 * El pedido que se registra solo al tocar "Enviar por WhatsApp" (v36).
 *
 * Queda en `ticket_deliveries` con estado `por_confirmar`: todavía no es una
 * venta, porque nadie vio el comprobante. Lo confirma el staff en el panel.
 *
 * **El número lo genera el navegador, no la base.** WhatsApp se abre con
 * `window.open` y eso tiene que pasar en el mismo toque del botón: si se
 * esperara la respuesta de la base, el celular bloquea la ventana nueva. Así
 * que el número se arma acá, va en el mensaje, y el pedido se manda en
 * paralelo.
 *
 * **Si el pedido no llega a guardarse, no pasa nada grave**: el cliente igual
 * manda su mensaje y el staff carga la venta a mano, como antes de v36. Por
 * eso nada de esto le muestra un error al comprador.
 */

/** Sin 0/O ni 1/I/L: se dicta por teléfono y se lee en una captura. */
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generarCodigoPedido(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
}

export interface LineaPedido {
  ticketTypeId: string;
  quantity: number;
  /** Precio de LISTA. La base lo compara contra el del evento. */
  unitPrice: number;
  promoId?: string | null;
}

export interface PedidoWeb {
  code: string;
  eventId: string;
  fullName: string;
  email: string;
  phoneE164: string;
  documentId?: string | null;
  lines: LineaPedido[];
  /** Total con las promos descontadas: el mismo TOTAL del mensaje. */
  total: number;
}

/**
 * Token de la sesión, leído ANTES del toque. El pedido se manda en el mismo
 * instante en que se abre WhatsApp, y en ese momento no hay tiempo de esperar
 * a `getSession()`. Con sesión, la base engancha el pedido al perfil.
 */
let tokenSesion: string | null = null;
export function prepararPedidoWeb(): void {
  supabase.auth.getSession().then(({ data }) => {
    tokenSesion = data.session?.access_token ?? null;
  });
}

/**
 * Manda el pedido sin esperar nada antes. `keepalive` deja que el pedido
 * termine aunque la pestaña pase a segundo plano porque se abrió WhatsApp.
 */
export function registrarPedidoWeb(p: PedidoWeb): Promise<boolean> {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const [nombre, ...resto] = p.fullName.trim().split(/\s+/);

  return fetch(`${url}/rest/v1/rpc/crear_pedido_web`, {
    method: "POST",
    keepalive: true,
    headers: {
      apikey: key,
      Authorization: `Bearer ${tokenSesion ?? key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_code: p.code,
      p_event_id: p.eventId,
      p_first_name: nombre ?? "",
      p_last_name: resto.join(" "),
      p_email: p.email.trim(),
      p_phone: p.phoneE164,
      p_document: p.documentId ?? null,
      p_lines: p.lines.map((l) => ({
        ticket_type_id: l.ticketTypeId,
        quantity: l.quantity,
        unit_price: l.unitPrice,
        promo_id: l.promoId ?? null,
      })),
      p_value: p.total,
    }),
  })
    .then(async (res) => {
      if (!res.ok && import.meta.env.DEV) {
        console.warn("[pedido web] no se registró:", res.status, await res.text());
      }
      return res.ok;
    })
    .catch((err) => {
      if (import.meta.env.DEV) console.warn("[pedido web] no se registró:", err);
      return false;
    });
}
