import type { TicketDelivery } from "@/lib/deliveries";

/**
 * Filtros de la pestaña Entregas.
 *
 * Antes la pestaña mostraba TODOS los eventos uno debajo del otro: con dos o
 * tres fechas a la venta, quien manda entradas tenía que bajar buscando la
 * suya. Ahora se elige UN evento (el próximo, por defecto) y dentro de él se
 * filtra por tipo de entrada, comprobante y origen. "Todos los eventos" sigue
 * existiendo para quien quiera la vista de antes.
 *
 * Todo es en memoria: las entregas ya vienen enteras (`fetchDeliveries`).
 */

export const TODOS = "todos";
/** Entregas cargadas antes de v18, que no saben qué tipo de entrada compraron. */
export const SIN_DESGLOSE = "sin_desglose";

export interface FiltrosEntregas {
  /** id del evento, o `TODOS`. */
  evento: string;
  /** `ticketTypeId`, `TODOS` o `SIN_DESGLOSE`. */
  tipo: string;
  comprobante: typeof TODOS | "con" | "sin";
  origen: typeof TODOS | "web" | "manual";
}

export const FILTROS_INICIALES: FiltrosEntregas = {
  evento: TODOS,
  tipo: TODOS,
  comprobante: TODOS,
  origen: TODOS,
};

/** ¿La entrega pasa los filtros? (El estado y la búsqueda van aparte.) */
export function pasaFiltros(
  d: TicketDelivery,
  f: FiltrosEntregas,
  /** Con v45 una venta puede tener comprobantes además de `receiptPath`. */
  tieneComprobante: (d: TicketDelivery) => boolean = (x) => Boolean(x.receiptPath)
): boolean {
  if (f.evento !== TODOS && d.eventId !== f.evento) return false;
  if (f.tipo === SIN_DESGLOSE && d.tickets.length > 0) return false;
  if (f.tipo !== TODOS && f.tipo !== SIN_DESGLOSE && !d.tickets.some((t) => t.ticketTypeId === f.tipo)) {
    return false;
  }
  if (f.comprobante === "con" && !tieneComprobante(d)) return false;
  if (f.comprobante === "sin" && tieneComprobante(d)) return false;
  if (f.origen !== TODOS && d.origin !== f.origen) return false;
  return true;
}

/** Hay algún filtro puesto además del evento. */
export const hayFiltrosExtra = (f: FiltrosEntregas) =>
  f.tipo !== TODOS || f.comprobante !== TODOS || f.origen !== TODOS;

/**
 * Cuántas entradas de una entrega cuentan con el filtro de tipo puesto. Con
 * "VIP" elegido, una venta de 2 General + 1 VIP suma 1: es lo que hay que
 * mandar de ese tipo.
 */
export function entradasQueCuentan(d: TicketDelivery, tipo: string): number {
  if (tipo === TODOS || tipo === SIN_DESGLOSE) return d.quantity;
  return d.tickets.filter((t) => t.ticketTypeId === tipo).reduce((a, t) => a + t.quantity, 0);
}

/** "General 40 · VIP 12" de un conjunto de entregas, de mayor a menor. */
export function entradasPorTipo(rows: TicketDelivery[]): { nombre: string; cantidad: number }[] {
  const porTipo = new Map<string, number>();
  let sinDesglose = 0;
  for (const d of rows) {
    if (d.tickets.length === 0) sinDesglose += d.quantity;
    for (const t of d.tickets) porTipo.set(t.name, (porTipo.get(t.name) ?? 0) + t.quantity);
  }
  const lista = [...porTipo.entries()]
    .map(([nombre, cantidad]) => ({ nombre, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre));
  if (sinDesglose > 0) lista.push({ nombre: "Sin tipo", cantidad: sinDesglose });
  return lista;
}

export interface OpcionTipo {
  id: string;
  nombre: string;
  /** Ventas que incluyen ese tipo. */
  ventas: number;
}

/** Los tipos de entrada que aparecen en estas entregas, para los botones del filtro. */
export function opcionesTipos(rows: TicketDelivery[]): OpcionTipo[] {
  const tipos = new Map<string, OpcionTipo>();
  let sinDesglose = 0;
  for (const d of rows) {
    if (d.tickets.length === 0) sinDesglose++;
    const vistos = new Set<string>();
    for (const t of d.tickets) {
      if (vistos.has(t.ticketTypeId)) continue;
      vistos.add(t.ticketTypeId);
      const o = tipos.get(t.ticketTypeId) ?? { id: t.ticketTypeId, nombre: t.name, ventas: 0 };
      o.ventas++;
      tipos.set(t.ticketTypeId, o);
    }
  }
  const lista = [...tipos.values()].sort((a, b) => b.ventas - a.ventas || a.nombre.localeCompare(b.nombre));
  if (sinDesglose > 0) lista.push({ id: SIN_DESGLOSE, nombre: "Sin tipo", ventas: sinDesglose });
  return lista;
}

export interface OpcionEvento {
  id: string;
  nombre: string;
  /** "YYYY-MM-DD", o "" si el evento se borró. */
  fecha: string;
  pasado: boolean;
}

/** Hoy en Uruguay como "YYYY-MM-DD", con los getters locales (no `toISOString`, que pasa a UTC). */
function hoyLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Los eventos que tienen entregas: primero los que vienen (el más cercano
 * arriba) y después los que pasaron (el más reciente arriba).
 */
export function opcionesEventos(
  deliveries: TicketDelivery[],
  events: { id: string; name: string; date: string }[]
): OpcionEvento[] {
  const hoy = hoyLocal();
  const ids = [...new Set(deliveries.map((d) => d.eventId))];
  const lista = ids.map((id) => {
    const e = events.find((x) => x.id === id);
    const fecha = e?.date?.slice(0, 10) ?? "";
    return { id, nombre: e?.name ?? "Evento eliminado", fecha, pasado: !fecha || fecha < hoy };
  });
  const proximos = lista.filter((o) => !o.pasado).sort((a, b) => a.fecha.localeCompare(b.fecha));
  const pasados = lista.filter((o) => o.pasado).sort((a, b) => b.fecha.localeCompare(a.fecha));
  return [...proximos, ...pasados];
}

/** El evento con el que abre la pestaña: el próximo que tenga entregas. */
export const eventoPorDefecto = (opciones: OpcionEvento[]): string => opciones[0]?.id ?? TODOS;

/** El evento elegido se recuerda en este navegador: cada uno trabaja su fecha. */
const CLAVE = "odisea:entregas:evento";

export function eventoGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

export function guardarEvento(id: string): void {
  try {
    localStorage.setItem(CLAVE, id);
  } catch {
    // Storage bloqueado: se elige de nuevo la próxima vez.
  }
}
