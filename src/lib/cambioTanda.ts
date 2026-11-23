import { supabase } from "@/lib/supabase";
import type { AdminEvent } from "@/contexts/AuthContext";
import type { Moneda } from "@/lib/moneda";
import { EventTicket, TicketType, saveEventTickets, sortEventTickets } from "@/lib/ticketTypes";

/**
 * Cambio de tanda (lote) de un evento: se saca de la venta el lote actual y se
 * abre el siguiente, con otro precio (típicamente +20%).
 *
 * **Un lote es un tipo de entrada del catálogo** ("General – 1er lote") con su
 * precio en `event_ticket_types`; no hay un concepto de "lote" aparte. Por eso el
 * cambio crea (o reutiliza) el tipo del lote nuevo y deja el viejo en el evento
 * con `active = false`: **no se borra**, así las ventas ya hechas (que apuntan al
 * tipo, v18) conservan su historia y en Entregas se ve en qué tanda compró cada uno.
 */

const ORDINALES = ["", "1er", "2do", "3er", "4to", "5to", "6to", "7mo", "8vo", "9no", "10mo"];
const ordinal = (n: number) => ORDINALES[n] ?? `${n}º`;

/** "General – 1er lote" → "General – 2do lote"; "Lote 1" → "Lote 2"; sin número, "X – 2do lote". */
export const nombreDeLaSiguienteTanda = (nombre: string): string => {
  const a = nombre.match(/(\d+)\s*(?:er|ro|do|to|vo|mo|no|º|°|ª)?\s*lote/i);
  if (a) return nombre.replace(a[0], `${ordinal(Number(a[1]) + 1)} lote`);
  const b = nombre.match(/lote\s*(\d+)/i);
  if (b) return nombre.replace(b[0], `Lote ${Number(b[1]) + 1}`);
  return `${nombre} – 2do lote`;
};

/**
 * El precio con el aumento, redondeado: a los 10 pesos (600 → 720, 450 → 540, y
 * 427 no existe) o al dólar entero. El staff lo puede pisar fila por fila.
 */
export const precioConAumento = (precio: number, porcentaje: number, moneda: Moneda): number => {
  const paso = moneda === "USD" ? 1 : 10;
  return Math.max(0, Math.round((precio * (1 + porcentaje / 100)) / paso) * paso);
};

export interface FilaTanda {
  ticketTypeId: string;
  description?: string;
  isAbono?: boolean;
  sortOrder: number;
  nombreActual: string;
  precioActual: number;
  incluir: boolean;
  nombreNuevo: string;
  precioNuevo: number;
  /** Entradas del lote nuevo (cupo automático, v43). Vacío = sin cupo. */
  cupoNuevo: number | null;
}

export interface ResultadoCambio {
  ok: boolean;
  error?: string;
  promosCopiadas: number;
  promosOmitidas: number;
}

const normaliza = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Aplica el cambio. No es transaccional (son varias tablas), así que se hace en
 * orden de menor a mayor daño si algo falla a medias: primero el catálogo (un tipo
 * de más es inofensivo), después las entradas del evento y al final las promos.
 */
export async function aplicarCambioTanda(args: {
  evento: AdminEvent;
  filas: FilaTanda[];
  catalogo: TicketType[];
  pasarPromos: boolean;
}): Promise<ResultadoCambio> {
  const { evento, filas, catalogo, pasarPromos } = args;
  const falla = (error: string): ResultadoCambio => ({ ok: false, error, promosCopiadas: 0, promosOmitidas: 0 });

  const incluidas = filas.filter((f) => f.incluir);
  if (incluidas.length === 0) return falla("Elegí al menos una entrada para pasar a la nueva tanda.");

  const nombres = new Set<string>();
  for (const f of incluidas) {
    if (!f.nombreNuevo.trim()) return falla("Todas las entradas nuevas necesitan un nombre.");
    if (!(f.precioNuevo > 0)) return falla(`Poné el precio de "${f.nombreNuevo}".`);
    const n = normaliza(f.nombreNuevo);
    if (n === normaliza(f.nombreActual)) {
      return falla(`"${f.nombreNuevo}" se llama igual que el lote actual: cambiale el nombre (por ejemplo "2do lote").`);
    }
    if (nombres.has(n)) return falla(`Hay dos entradas nuevas con el nombre "${f.nombreNuevo}".`);
    nombres.add(n);
  }

  // 1) Catálogo: se reutiliza el tipo si ya existe con ese nombre; si no, se crea.
  const idNuevo = new Map<string, string>(); // ticketTypeId viejo → id del tipo nuevo
  const tipoDe = new Map<string, TicketType>(catalogo.map((t) => [normaliza(t.name), t]));
  let ordenCatalogo = Math.max(0, ...catalogo.map((t) => t.sortOrder)) + 1;
  for (const f of incluidas) {
    const existente = tipoDe.get(normaliza(f.nombreNuevo));
    if (existente) {
      idNuevo.set(f.ticketTypeId, existente.id);
      continue;
    }
    const { data, error } = await supabase
      .from("ticket_types")
      .insert({
        name: f.nombreNuevo.trim(),
        description: f.description || null,
        sort_order: ordenCatalogo++,
        is_abono: !!f.isAbono,
        active: true,
      })
      .select("id")
      .single();
    if (error || !data) {
      return falla(`No se pudo crear el tipo "${f.nombreNuevo}": ${error?.message ?? "sin respuesta"}`);
    }
    idNuevo.set(f.ticketTypeId, data.id);
  }

  // 2) Entradas del evento: las viejas quedan pero apagadas; las nuevas, a la venta.
  const viejas = new Set(incluidas.map((f) => f.ticketTypeId));
  const tickets: EventTicket[] = evento.tickets.map((t) =>
    viejas.has(t.ticketTypeId) ? { ...t, active: false } : t
  );
  for (const f of incluidas) {
    const id = idNuevo.get(f.ticketTypeId)!;
    const propias = {
      price: f.precioNuevo,
      active: true,
      // Con cupo se cuenta solo; si no, no se manda nada (ni se hereda el número
      // manual de "quedan N" del lote anterior, que ya no corresponde).
      ...(f.cupoNuevo !== null ? { loteCupo: f.cupoNuevo } : {}),
    };
    const i = tickets.findIndex((t) => t.ticketTypeId === id);
    if (i >= 0) {
      // El evento ya tenía ese tipo (por ejemplo un 2do lote cargado de antemano).
      tickets[i] = { ...tickets[i], ...propias };
    } else {
      tickets.push({
        ticketTypeId: id,
        name: f.nombreNuevo.trim(),
        description: f.description,
        isAbono: f.isAbono,
        // Mismo lugar que el lote al que reemplaza: el viejo queda oculto.
        sortOrder: f.sortOrder,
        ...propias,
      });
    }
  }
  const guardado = await saveEventTickets(evento.id, sortEventTickets(tickets));
  if (!guardado.ok) return falla(guardado.error ?? "No se pudieron guardar las entradas.");

  // 3) Promos: se copian al lote nuevo las de descuento. Una de "precio especial"
  // tiene un precio fijo pensado para el lote viejo: no se copia (se omite y se avisa).
  let promosCopiadas = 0;
  let promosOmitidas = 0;
  if (pasarPromos) {
    const { data, error } = await supabase
      .from("event_ticket_promos")
      .select("*, ticket_promos(kind)")
      .eq("event_id", evento.id)
      .in("ticket_type_id", [...viejas]);
    if (error) {
      return {
        ok: false,
        error: `Las entradas se cambiaron, pero no se pudieron leer las promos: ${error.message}`,
        promosCopiadas,
        promosOmitidas,
      };
    }
    const ahora = Date.now();
    const copias = [];
    for (const r of data ?? []) {
      const vencida = r.ends_at && Date.parse(r.ends_at) < ahora;
      if (vencida) continue;
      const kind = Array.isArray(r.ticket_promos) ? r.ticket_promos[0]?.kind : r.ticket_promos?.kind;
      if (kind === "precio_especial") {
        promosOmitidas++;
        continue;
      }
      copias.push({
        event_id: r.event_id,
        promo_id: r.promo_id,
        ticket_type_id: idNuevo.get(r.ticket_type_id),
        starts_at: r.starts_at,
        ends_at: r.ends_at,
        quota: r.quota,
        special_price: null,
      });
    }
    if (copias.length) {
      const { error: errPromo } = await supabase
        .from("event_ticket_promos")
        .upsert(copias, { onConflict: "event_id,promo_id,ticket_type_id" });
      if (errPromo) {
        return {
          ok: false,
          error: `Las entradas se cambiaron, pero no se pudieron copiar las promos: ${errPromo.message}`,
          promosCopiadas,
          promosOmitidas,
        };
      }
      promosCopiadas = copias.length;
    }
  }

  return { ok: true, promosCopiadas, promosOmitidas };
}
