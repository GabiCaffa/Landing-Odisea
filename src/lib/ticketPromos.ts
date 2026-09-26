import { supabase } from "@/lib/supabase";

/**
 * Promos de entradas: 2x1, 2da al 50%, 3x2, % off, precio especial.
 *
 * **Dos mecanismos** (`kind`):
 *
 * 1. `descuento` — tres números: `cada N entradas, M con X% de descuento`.
 *
 *      2x1                → cada 2, 1 al 100%
 *      2da al 50%         → cada 2, 1 al 50%
 *      3x2                → cada 3, 1 al 100%
 *      3 al precio de 1   → cada 3, 2 al 100%
 *      20% off en todas   → cada 1, 1 al 20%      (v24)
 *
 * 2. `precio_especial` — la entrada sale a un precio fijo mientras dure la
 *    promo ("la General a $500"). El número depende del evento y del tipo, así
 *    que NO está en el catálogo: viene en la asignación (`specialPrice`).
 *
 * **Los números son INTERNOS.** El comprador ve el `name` que escribió el admin
 * ("2x1") y el precio ya descontado; nunca la fórmula.
 *
 * Es un catálogo (`ticket_promos`) más una tabla de unión
 * (`event_ticket_promos`), igual que `ticket_types` ↔ `event_ticket_types`,
 * porque la misma promo se aplica a varios eventos. **Desde v24 la vigencia,
 * el cupo y el precio especial viven en la unión**: el mismo "2x1" vence a
 * distinta hora en cada fecha.
 */

export type PromoKind = "descuento" | "precio_especial";

export interface TicketPromo {
  id: string;
  /** Lo que lee el cliente. */
  name: string;
  description?: string;
  kind: PromoKind;
  /** Cada cuántas entradas se aplica. Interno. Sin valor en `precio_especial`. */
  everyN?: number;
  /** Cuántas de esas N se descuentan. Hasta `everyN`. Interno. */
  discountedUnits: number;
  /** Qué porcentaje se les descuenta. Interno. Sin valor en `precio_especial`. */
  percentOff?: number;
  active: boolean;
  createdAt: string;
}

/** Una promo tal como la aplica un evento, sobre un tipo de entrada. */
export interface EventPromo {
  /** Id de la fila de unión, no de la promo. */
  id: string;
  promoId: string;
  ticketTypeId: string;
  name: string;
  description?: string;
  kind: PromoKind;
  everyN?: number;
  discountedUnits: number;
  percentOff?: number;
  /** ISO con zona (timestamptz). Sin valor = sin límite de ese lado. */
  startsAt?: string;
  endsAt?: string;
  /** Cuántas entradas se venden con la promo. Sin valor = sin cupo. */
  quota?: number;
  /**
   * Cuántas quedan del cupo, según las entregas cargadas (v24). Lo completa
   * `AuthContext` con `fetchCuposRestantes`. Sin valor = no hay cupo, **o no
   * se pudo averiguar**: en los dos casos la promo se muestra y se aplica. El
   * precio lo confirma el staff; esconder una promo vigente porque falló una
   * consulta sería peor que mostrarla de más.
   */
  remaining?: number;
  /** Precio de la entrada durante la promo. Sólo en `precio_especial`. */
  specialPrice?: number;
  active: boolean;
}

export interface TicketPromoInput {
  name: string;
  description?: string | null;
  kind: PromoKind;
  everyN?: number | null;
  discountedUnits?: number;
  percentOff?: number | null;
  active?: boolean;
}

/** Lo que el form de evento guarda por cada promo asignada. */
export interface EventPromoInput {
  promoId: string;
  ticketTypeId: string;
  /** ISO con zona. Vacío o sin valor = sin límite. */
  startsAt?: string | null;
  endsAt?: string | null;
  quota?: number | null;
  specialPrice?: number | null;
}

// ─── Vigencia ───────────────────────────────────────────────────────────────

/**
 * ¿La promo está activa, dentro de su ventana y con cupo?
 *
 * La ventana es un instante (`timestamptz`), así que se compara en
 * milisegundos y no hace falta pensar en zonas horarias: `Date.parse` de un ISO
 * con offset da el mismo instante en cualquier teléfono. Hasta v24 eran días
 * (`date`) y había que armar "hoy" a mano con los getters locales.
 *
 * Corre con el reloj de quien mira. Un teléfono con la hora mal ve la promo un
 * rato de más o de menos; el precio final lo confirma el staff al cobrar.
 */
export const promoVigente = (p: EventPromo, ahora = Date.now()): boolean => {
  if (!p.active) return false;
  if (p.startsAt && ahora < Date.parse(p.startsAt)) return false;
  if (p.endsAt && ahora > Date.parse(p.endsAt)) return false;
  if (p.remaining !== undefined && p.remaining <= 0) return false;
  return true;
};

/**
 * Desde cuántas horas antes del fin la promo pasa de "Hasta el vie 12/10" a
 * contador ("Termina en 5 h 12 min"). Un contador de 20 días no genera
 * urgencia: sólo ocupa lugar y se lee como un error.
 */
export const HORAS_CONTADOR = 72;

const MIN = 60_000;
const HORA = 60 * MIN;

/**
 * Las fechas se muestran SIEMPRE en hora de Uruguay, no en la del teléfono.
 * Es la hora en la que el admin cargó el vencimiento y en la que se hace la
 * fiesta; alguien mirando desde Buenos Aires tiene que leer "23:59" y no
 * "00:59", que parecería otro día.
 */
const fmtFin = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  weekday: "short",
  day: "numeric",
  month: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * "vie 12/10, 23:59". Se arma por partes y no con `format()`: el formato
 * completo cambia entre navegadores (probado: sale "vie, 12/10, 11:59 p. m."
 * según el motor), y las partes son estables.
 */
export const formatFinPromo = (iso: string): string => {
  const p = Object.fromEntries(
    fmtFin.formatToParts(new Date(iso)).map((x) => [x.type, x.value])
  ) as Record<string, string>;
  return `${p.weekday.replace(".", "")} ${p.day}/${p.month}, ${p.hour}:${p.minute}`;
};

/**
 * Cuánto falta, en partes, para el contador. `null` si ya venció.
 * Las partes van sueltas (y no un string) porque la home las pinta cada una
 * en su casillero.
 */
export const partesRestantes = (
  endsAt: string,
  ahora = Date.now()
): { dias: number; horas: number; minutos: number; segundos: number; ms: number } | null => {
  const ms = Date.parse(endsAt) - ahora;
  if (ms <= 0) return null;
  return {
    dias: Math.floor(ms / (24 * HORA)),
    horas: Math.floor((ms % (24 * HORA)) / HORA),
    minutos: Math.floor((ms % HORA) / MIN),
    segundos: Math.floor((ms % MIN) / 1000),
    ms,
  };
};

/**
 * El vencimiento en una línea, para lugares chicos (el modal de compra).
 *
 *   sin fin                → null
 *   más de 72 h            → "Hasta el vie 12/10, 23:59"
 *   menos de 72 h          → "Termina en 2 d 5 h" / "Termina en 5 h 12 min"
 *   menos de 1 h           → "Termina en 12 min"
 *
 * Sin segundos: esto no se repinta cada segundo. El contador en vivo es el de
 * la home.
 */
export const textoVencimiento = (endsAt: string | undefined, ahora = Date.now()): string | null => {
  if (!endsAt) return null;
  const r = partesRestantes(endsAt, ahora);
  if (!r) return null;
  if (r.ms > HORAS_CONTADOR * HORA) return `Hasta el ${formatFinPromo(endsAt)}`;
  if (r.dias > 0) return `Termina en ${r.dias} d ${r.horas} h`;
  if (r.horas > 0) return `Termina en ${r.horas} h ${r.minutos} min`;
  return `Termina en ${Math.max(1, r.minutos)} min`;
};

// ─── El cálculo ─────────────────────────────────────────────────────────────

export interface DescuentoAplicado {
  promo: EventPromo;
  /** Cuántas entradas se descontaron. */
  unidades: number;
  /** Cuánto se descuenta, en pesos. Siempre positivo. */
  monto: number;
}

/**
 * Cuánto descuenta una promo sobre `cantidad` entradas de precio `precio`.
 *
 * **Descuento:** `floor(cantidad / everyN)` es cuántas veces entra la promo, y
 * cada vez descuenta `discountedUnits` entradas. Con "2da al 50%" y 4 entradas
 * entra DOS veces: si entrara una sola, la promo premiaría comprar de a dos y
 * castigaría comprar de a cuatro.
 *
 * **Precio especial:** cada entrada paga `specialPrice` en vez del precio de
 * lista. Si el especial no es más barato no hay descuento: pasa si alguien baja
 * el precio del tipo después de cargar la promo, y "ahorrás $0" no es una promo.
 *
 * **Cupo:** si quedan menos entradas en promo que las que se compran, la promo
 * se aplica sólo a las que quedan y el resto va a precio de lista. Quedan 3 y
 * se compran 4 en 2x1: una vez el 2x1 (2 entradas), y las otras dos completas.
 *
 * Se redondea al peso porque los precios son enteros; `Math.round` y no `floor`
 * para no quedarnos con el medio peso a favor nuestro en cada operación.
 */
export const descuentoDe = (
  promo: EventPromo,
  precio: number,
  cantidad: number,
  ahora = Date.now()
): DescuentoAplicado | null => {
  if (!promoVigente(promo, ahora) || precio <= 0) return null;
  const elegibles =
    promo.remaining !== undefined ? Math.min(cantidad, promo.remaining) : cantidad;
  if (elegibles <= 0) return null;

  let unidades: number;
  let monto: number;
  if (promo.kind === "precio_especial") {
    if (promo.specialPrice === undefined || promo.specialPrice >= precio) return null;
    unidades = elegibles;
    monto = Math.round(unidades * (precio - promo.specialPrice));
  } else {
    const everyN = promo.everyN ?? 0;
    const percentOff = promo.percentOff ?? 0;
    if (everyN < 1 || elegibles < everyN) return null;
    unidades = Math.floor(elegibles / everyN) * Math.max(1, promo.discountedUnits);
    monto = Math.round(unidades * precio * (percentOff / 100));
  }
  if (monto <= 0) return null;
  return { promo, unidades, monto };
};

/**
 * De todas las promos cargadas para un tipo de entrada, cuál se aplica.
 *
 * **Gana la que más descuenta.** Puede haber varias vigentes sobre el mismo
 * tipo —la tabla lo permite a propósito, para poder programar una de preventa y
 * otra después—, y si dos ventanas se pisan hay que elegir. Elegir la mejor
 * para el comprador es la única regla que no necesita explicación y que nunca
 * lo perjudica. **No se acumulan**: se aplica una sola.
 */
export const mejorDescuento = (
  promos: EventPromo[],
  ticketTypeId: string,
  precio: number,
  cantidad: number,
  ahora = Date.now()
): DescuentoAplicado | null => {
  let mejor: DescuentoAplicado | null = null;
  for (const p of promos) {
    if (p.ticketTypeId !== ticketTypeId) continue;
    const d = descuentoDe(p, precio, cantidad, ahora);
    if (d && (!mejor || d.monto > mejor.monto)) mejor = d;
  }
  return mejor;
};

// ─── Acceso a datos ─────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
const kindFromDb = (v: any): PromoKind => (v === "precio_especial" ? "precio_especial" : "descuento");
const numOrUndef = (v: any): number | undefined =>
  v === null || v === undefined ? undefined : Number(v);

const promoFromDb = (row: any): TicketPromo => ({
  id: row.id,
  name: row.name,
  description: row.description ?? undefined,
  kind: kindFromDb(row.kind),
  everyN: numOrUndef(row.every_n),
  discountedUnits: row.discounted_units ?? 1,
  percentOff: numOrUndef(row.percent_off),
  active: row.active,
  createdAt: row.created_at,
});

/** Fila de unión + los datos de la promo, embebidos por la FK. */
export const eventPromoFromDb = (row: any): EventPromo => ({
  id: row.id,
  promoId: row.promo_id,
  ticketTypeId: row.ticket_type_id,
  name: row.ticket_promos?.name ?? "",
  description: row.ticket_promos?.description ?? undefined,
  kind: kindFromDb(row.ticket_promos?.kind),
  everyN: numOrUndef(row.ticket_promos?.every_n),
  discountedUnits: row.ticket_promos?.discounted_units ?? 1,
  percentOff: numOrUndef(row.ticket_promos?.percent_off),
  // v24: la ventana es de la ASIGNACIÓN. Las columnas del catálogo quedaron
  // obsoletas y no se leen.
  startsAt: row.starts_at ?? undefined,
  endsAt: row.ends_at ?? undefined,
  quota: numOrUndef(row.quota),
  specialPrice: numOrUndef(row.special_price),
  // Una promo apagada en el catálogo se apaga en TODOS los eventos; la fila de
  // unión sólo puede apagarla en uno. Por eso hacen falta las dos.
  active: !!row.active && !!row.ticket_promos?.active,
});

const promoToDb = (input: Partial<TicketPromoInput>): Record<string, any> => {
  const out: Record<string, any> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.description !== undefined) out.description = input.description || null;
  if (input.kind !== undefined) out.kind = input.kind;
  if (input.everyN !== undefined) out.every_n = input.everyN;
  if (input.discountedUnits !== undefined) out.discounted_units = input.discountedUnits;
  if (input.percentOff !== undefined) out.percent_off = input.percentOff;
  if (input.active !== undefined) out.active = input.active;
  // Un precio especial no tiene fórmula: se limpian los números para que no
  // quede un "cada 2, 1 al 100%" viejo escondido detrás de un precio fijo.
  if (input.kind === "precio_especial") {
    out.every_n = null;
    out.percent_off = null;
    out.discounted_units = 1;
  }
  return out;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export async function fetchTicketPromos(): Promise<TicketPromo[]> {
  const { data, error } = await supabase
    .from("ticket_promos")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []).map(promoFromDb);
}

/** Clave de una asignación, para cruzar el cupo con la promo del evento. */
export const cupoKey = (eventId: string, promoId: string, ticketTypeId: string) =>
  `${eventId}:${promoId}:${ticketTypeId}`;

/**
 * Cuántas entradas quedan en promo, por asignación (v24).
 *
 * Sale de la RPC `promo_cupos_restantes`, que cuenta sobre las entregas: el
 * público no puede leerlas (montos, compradores), así que la base devuelve sólo
 * el número. Si falla devuelve `null` y **no** un mapa vacío: un mapa vacío se
 * leería como "ninguna promo tiene cupo", que es otra cosa.
 */
export async function fetchCuposRestantes(): Promise<Map<string, number> | null> {
  const { data, error } = await supabase.rpc("promo_cupos_restantes");
  if (error || !data) return null;
  const out = new Map<string, number>();
  for (const row of data as Array<{
    event_id: string;
    promo_id: string;
    ticket_type_id: string;
    restantes: number;
  }>) {
    out.set(cupoKey(row.event_id, row.promo_id, row.ticket_type_id), row.restantes);
  }
  return out;
}

export async function createTicketPromo(
  input: TicketPromoInput
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("ticket_promos").insert(promoToDb(input));
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function updateTicketPromo(
  id: string,
  input: Partial<TicketPromoInput>
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("ticket_promos").update(promoToDb(input)).eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Borra una promo del catálogo.
 *
 * Las FK son `on delete restrict`, así que falla si algún evento la usa o si
 * hay ventas cargadas con ella (v24). El código 23503 se traduce a un mensaje
 * que dice qué hacer — mismo criterio que las cuentas de cobro (v13), donde un
 * "violates foreign key constraint" no le sirve a nadie.
 */
export async function deleteTicketPromo(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("ticket_promos").delete().eq("id", id);
  if (!error) return { ok: true };
  if (error.code === "23503") {
    return {
      ok: false,
      error:
        "Esta promo está en algún evento o tiene ventas cargadas. Sacala de los eventos o desactivala.",
    };
  }
  return { ok: false, error: error.message };
}

/**
 * Reemplaza las promos de un evento.
 *
 * Mismo criterio que `saveEventTickets` (v15): se borra lo que salió y se
 * inserta lo que entró, en vez de intentar un diff fino. El conjunto es chico y
 * así no queda estado a medias si algo falla.
 *
 * **Borrar y reinsertar no pierde el cupo vendido**: lo vendido no se guarda
 * en esta fila, se cuenta desde las entregas (`delivery_ticket_types.promo_id`
 * apunta al catálogo). Lo que sí hay que mandar entero en cada guardado es la
 * ventana, el cupo y el precio: lo que no viaja acá se pierde.
 */
export async function saveEventPromos(
  eventId: string,
  promos: EventPromoInput[]
): Promise<{ ok: boolean; error?: string }> {
  const { error: delError } = await supabase
    .from("event_ticket_promos")
    .delete()
    .eq("event_id", eventId);
  if (delError) return { ok: false, error: delError.message };

  if (promos.length === 0) return { ok: true };

  const { error } = await supabase.from("event_ticket_promos").insert(
    promos.map((p) => ({
      event_id: eventId,
      promo_id: p.promoId,
      ticket_type_id: p.ticketTypeId,
      starts_at: p.startsAt || null,
      ends_at: p.endsAt || null,
      quota: p.quota ?? null,
      special_price: p.specialPrice ?? null,
    }))
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}
