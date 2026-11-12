import type { TicketDelivery } from "@/lib/deliveries";

/**
 * Filtros de la pestaña Entregas.
 *
 * Antes la pestaña mostraba TODOS los eventos uno debajo del otro: con dos o
 * tres fechas a la venta, quien manda entradas tenía que bajar buscando la
 * suya. Ahora se elige UN evento (el próximo, por defecto) y dentro de él se
 * filtra por tipo de entrada, precio, comprobante, origen, promo y fecha de
 * carga, y se elige el orden. "Todos los eventos" sigue existiendo para quien
 * quiera la vista de antes.
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
  /**
   * Precio unitario, como texto ("800"), o `TODOS`. Es el precio de LISTA de
   * la línea (lo que identifica el lote), no lo pagado después de una promo.
   */
  precio: string;
  /** Ventas con alguna promo aplicada (2x1, etc.), o sin ninguna. */
  promo: typeof TODOS | "con" | "sin";
  /** Cuándo se cargó la venta (o entró el pedido de la web). */
  fecha: typeof TODOS | "hoy" | "ayer" | "semana";
  /** Orden de la lista. No es un filtro: "Limpiar filtros" no lo toca. */
  orden: OrdenEntregas;
}

export type OrdenEntregas = "nuevas" | "espera" | "monto" | "nombre";

export const FILTROS_INICIALES: FiltrosEntregas = {
  evento: TODOS,
  tipo: TODOS,
  comprobante: TODOS,
  origen: TODOS,
  precio: TODOS,
  promo: TODOS,
  fecha: TODOS,
  orden: "nuevas",
};

/** Saca los filtros y deja el evento y el orden como están. */
export const limpiarFiltros = (f: FiltrosEntregas): FiltrosEntregas => ({
  ...FILTROS_INICIALES,
  evento: f.evento,
  orden: f.orden,
});

/** Una línea de la venta, para mirar tipo y precio juntos. */
interface LineaVenta {
  tipo: string;
  precio: number;
  cantidad: number;
}

/**
 * Las líneas de una venta. Una venta sin desglose (anterior a v18) cuenta como
 * UNA línea "sin tipo" al precio promedio (`total / cantidad`), así también
 * se puede filtrar por precio.
 */
function lineasDe(d: TicketDelivery): LineaVenta[] {
  if (d.tickets.length === 0) {
    return [{ tipo: SIN_DESGLOSE, precio: Math.round(d.value / Math.max(1, d.quantity)), cantidad: d.quantity }];
  }
  return d.tickets.map((t) => ({ tipo: t.ticketTypeId, precio: Math.round(t.unitPrice), cantidad: t.quantity }));
}

/**
 * Las líneas que pasan el tipo y el precio elegidos. Se miran JUNTOS, en la
 * misma línea: con "VIP" y "$800" elegidos, una venta de General a $800 y VIP
 * a $1.500 no pasa, porque ninguna de sus entradas es un VIP de $800.
 */
function lineasQuePasan(d: TicketDelivery, f: Pick<FiltrosEntregas, "tipo" | "precio">): LineaVenta[] {
  return lineasDe(d).filter(
    (l) => (f.tipo === TODOS || l.tipo === f.tipo) && (f.precio === TODOS || String(l.precio) === f.precio)
  );
}

/** "YYYY-MM-DD" local de un instante (los getters locales, no `toISOString`). */
function diaLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function pasaFecha(creada: string, fecha: FiltrosEntregas["fecha"], ahora: Date): boolean {
  if (fecha === TODOS) return true;
  const dia = diaLocal(new Date(creada));
  const hoy = diaLocal(ahora);
  if (fecha === "hoy") return dia === hoy;
  const atras = (n: number) => diaLocal(new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() - n));
  if (fecha === "ayer") return dia === atras(1);
  // Últimos 7 días, hoy incluido.
  return dia >= atras(6) && dia <= hoy;
}

/** ¿La entrega pasa los filtros? (El estado y la búsqueda van aparte.) */
export function pasaFiltros(
  d: TicketDelivery,
  f: FiltrosEntregas,
  /** Con v45 una venta puede tener comprobantes además de `receiptPath`. */
  tieneComprobante: (d: TicketDelivery) => boolean = (x) => Boolean(x.receiptPath),
  /** Contra qué momento se mira la fecha (sólo para las pruebas). */
  ahora: Date = new Date()
): boolean {
  if (f.evento !== TODOS && d.eventId !== f.evento) return false;
  if ((f.tipo !== TODOS || f.precio !== TODOS) && lineasQuePasan(d, f).length === 0) return false;
  if (f.comprobante === "con" && !tieneComprobante(d)) return false;
  if (f.comprobante === "sin" && tieneComprobante(d)) return false;
  if (f.origen !== TODOS && d.origin !== f.origen) return false;
  if (f.promo !== TODOS && d.tickets.some((t) => Boolean(t.promoId)) !== (f.promo === "con")) return false;
  if (!pasaFecha(d.createdAt, f.fecha, ahora)) return false;
  return true;
}

/** Hay algún filtro puesto además del evento (el orden no es un filtro). */
export const hayFiltrosExtra = (f: FiltrosEntregas) =>
  f.tipo !== TODOS ||
  f.comprobante !== TODOS ||
  f.origen !== TODOS ||
  f.precio !== TODOS ||
  f.promo !== TODOS ||
  f.fecha !== TODOS;

/** Cuántos de los filtros de los desplegables están puestos (el número del botón en celular). */
export const filtrosEnDesplegables = (f: FiltrosEntregas) =>
  [f.comprobante, f.origen, f.promo, f.fecha].filter((v) => v !== TODOS).length + (f.orden !== "nuevas" ? 1 : 0);

/**
 * Cuántas entradas de una entrega cuentan con el tipo y el precio elegidos.
 * Con "VIP" elegido, una venta de 2 General + 1 VIP suma 1: es lo que hay que
 * mandar de ese tipo. Sin ninguno de los dos, todas.
 */
export function entradasQueCuentan(d: TicketDelivery, f: Pick<FiltrosEntregas, "tipo" | "precio">): number {
  if (f.tipo === TODOS && f.precio === TODOS) return d.quantity;
  return lineasQuePasan(d, f).reduce((a, l) => a + l.cantidad, 0);
}

/** La lista en el orden elegido. No toca el arreglo que recibe. */
export function ordenar(rows: TicketDelivery[], orden: OrdenEntregas): TicketDelivery[] {
  const lista = [...rows];
  const porFecha = (a: TicketDelivery, b: TicketDelivery) => a.createdAt.localeCompare(b.createdAt);
  if (orden === "espera") return lista.sort(porFecha);
  if (orden === "nuevas") return lista.sort((a, b) => porFecha(b, a));
  if (orden === "monto") return lista.sort((a, b) => b.value - a.value || porFecha(b, a));
  return lista.sort((a, b) =>
    `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "es", { sensitivity: "base" })
  );
}

export interface OpcionPrecio {
  /** El precio como texto: el valor del filtro. */
  id: string;
  precio: number;
  /** Ventas con alguna entrada a ese precio. */
  ventas: number;
}

/**
 * Los precios unitarios que aparecen en estas entregas, de menor a mayor. Con
 * un tipo elegido, sólo los de ese tipo: los botones dicen a qué precios se
 * vendió "General", que es como se ven los lotes.
 */
export function opcionesPrecios(rows: TicketDelivery[], tipo: string = TODOS): OpcionPrecio[] {
  const precios = new Map<number, number>();
  for (const d of rows) {
    const suyos = new Set(lineasQuePasan(d, { tipo, precio: TODOS }).map((l) => l.precio));
    for (const p of suyos) precios.set(p, (precios.get(p) ?? 0) + 1);
  }
  return [...precios.entries()]
    .map(([precio, ventas]) => ({ id: String(precio), precio, ventas }))
    .sort((a, b) => a.precio - b.precio);
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
