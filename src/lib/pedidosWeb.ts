import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

/**
 * El pedido que se registra solo al tocar "Enviar por WhatsApp" (v40).
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
 * manda su mensaje y el staff carga la venta a mano, como antes de v40. Por
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

// ─── "Mi pedido": lo que ve el cliente (v43) ────────────────────────────────

export interface EstadoPedido {
  codigo: string;
  estado: "por_confirmar" | "pending" | "sent" | "vencido";
  evento: string;
  fecha: string;
  lugar: string;
  slug: string | null;
  cantidad: number;
  total: number;
  nombre: string;
  detalle: string | null;
  creado: string;
  confirmado: string | null;
  enviado: string | null;
}

/**
 * Estado de un pedido por su número. **Hace falta sesión** (v44): la base sólo
 * devuelve el pedido si es de la cuenta con la que se entró (o al staff).
 * `null` = no existe o no es tuyo; la base no distingue a propósito, así no se
 * puede averiguar si un número existe. Tira sólo si la consulta falla.
 */
export async function fetchEstadoPedido(codigo: string): Promise<EstadoPedido | null> {
  const { data, error } = await supabase.rpc("estado_pedido", { p_code: codigo });
  if (error) throw new Error(error.message);
  const fila = (data as EstadoPedido[] | null)?.[0];
  return fila ? { ...fila, total: Number(fila.total) } : null;
}

// ─── "Mis pedidos": la lista (v44) ──────────────────────────────────────────

/**
 * Los números de los pedidos hechos desde ESTE navegador. **No dan acceso a
 * nada** (los pedidos se ven sólo con la cuenta, v44): sirven para que el
 * botón "Mis pedidos" aparezca e invite a entrar a quien compró sin sesión.
 */
const CLAVE_LOCAL = "odisea:pedidos";
const AVISO = "odisea:pedidos";

export function pedidosLocales(): string[] {
  try {
    const lista = JSON.parse(localStorage.getItem(CLAVE_LOCAL) ?? "[]");
    return Array.isArray(lista) ? lista.filter((c) => typeof c === "string").slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function guardarPedidoLocal(codigo: string): void {
  try {
    const lista = [codigo, ...pedidosLocales().filter((c) => c !== codigo)].slice(0, 20);
    localStorage.setItem(CLAVE_LOCAL, JSON.stringify(lista));
    // Para que el botón del menú aparezca sin recargar.
    window.dispatchEvent(new Event(AVISO));
  } catch {
    // Storage bloqueado (incógnito): el pedido existe igual, sólo no se recuerda acá.
  }
}

/**
 * Los pedidos de la cuenta con la que se entró: los hechos con sesión y los
 * hechos sin cuenta con el mismo email (v44). Hace falta sesión.
 */
export async function fetchMisPedidos(): Promise<EstadoPedido[]> {
  const { data, error } = await supabase.rpc("mis_pedidos");
  if (error) throw new Error(error.message);
  return ((data as EstadoPedido[] | null) ?? []).map((p) => ({ ...p, total: Number(p.total) }));
}

/** Mostrar "Mis pedidos" en el menú: con sesión, o si se hizo algún pedido acá. */
export function useHayPedidos(conSesion: boolean): boolean {
  const [locales, setLocales] = useState(() => pedidosLocales().length > 0);
  useEffect(() => {
    const revisar = () => setLocales(pedidosLocales().length > 0);
    window.addEventListener(AVISO, revisar);
    // Otra pestaña hizo un pedido.
    window.addEventListener("storage", revisar);
    return () => {
      window.removeEventListener(AVISO, revisar);
      window.removeEventListener("storage", revisar);
    };
  }, []);
  return conSesion || locales;
}
