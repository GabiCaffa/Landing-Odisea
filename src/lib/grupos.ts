import { AdminEvent, formatEventDate } from "@/contexts/AuthContext";

/**
 * Fiestas de varios días (v26).
 *
 * Una fiesta que dura tres días son **tres eventos separados**: cada día tiene
 * sus entradas, sus precios, su venta y su URL. Lo único que agrega el grupo es
 * que el sitio sepa que van juntos, para mostrar UNA tarjeta en la home y un
 * selector de día adentro.
 *
 * Todo lo de acá es derivación en memoria: no hay ninguna consulta nueva. Los
 * eventos ya vienen todos en `AuthContext.events`.
 */

const MESES_CORTOS = [
  "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
  "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
];

/** Igual que `formatEventDate`, cortando el string ISO y no con `new Date()`:
 *  interpretarlo como fecha lo pasa a UTC y en Uruguay (UTC−3) devuelve el día
 *  anterior. Es la misma trampa documentada en §6.9 y en `birthdayMessage`. */
const partes = (iso: string) => {
  const [y, m, d] = (iso || "").split("-").map(Number);
  return y && m && d ? { y, m, d } : null;
};

/**
 * "31 OCT – 2 NOV 2026" para un grupo de días.
 *
 * **Un solo día sigue saliendo con `formatEventDate` ("31 OCTUBRE 2026")**: es
 * lo que la tarjeta decía antes de v26 y no hay motivo para cambiarlo. Los
 * meses se abrevian sólo en un rango, donde el nombre completo dos veces no
 * entra en la píldora.
 *
 * El año va una sola vez, al final, salvo que el rango cruce de un año al otro
 * (31 DIC – 1 ENE): ahí hace falta de los dos lados o se lee mal.
 */
export const rangoDeFechas = (fechas: string[]): string => {
  const ordenadas = [...fechas].sort();
  const a = partes(ordenadas[0]);
  const b = partes(ordenadas[ordenadas.length - 1]);
  if (!a) return "";
  if (!b || (a.y === b.y && a.m === b.m && a.d === b.d)) {
    return formatEventDate(ordenadas[0]);
  }
  const cruzaAnio = a.y !== b.y;
  const izq = cruzaAnio
    ? `${a.d} ${MESES_CORTOS[a.m - 1]} ${a.y}`
    : `${a.d} ${MESES_CORTOS[a.m - 1]}`;
  const der = `${b.d} ${MESES_CORTOS[b.m - 1]} ${b.y}`;
  return `${izq} – ${der}`;
};

/** Etiqueta corta de un día para el selector: "VIE 31 OCT". */
const DIAS_CORTOS = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];

export const etiquetaDeDia = (iso: string): { dia: string; fecha: string } => {
  const p = partes(iso);
  if (!p) return { dia: "", fecha: iso };
  // `Date.UTC` + getUTCDay: el día de la semana sale del número puro, sin que
  // la zona horaria lo corra. Con `new Date(iso)` + `getDay()` en UTC−3 un
  // evento del sábado se anuncia como viernes.
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return { dia: DIAS_CORTOS[dow], fecha: `${p.d} ${MESES_CORTOS[p.m - 1]}` };
};

/** Los días de un grupo, ordenados. Un evento suelto devuelve sólo a sí mismo. */
export const diasDelGrupo = (events: AdminEvent[], evento: AdminEvent): AdminEvent[] => {
  if (!evento.groupKey) return [evento];
  return events
    .filter((e) => e.groupKey === evento.groupKey)
    .sort((a, b) => a.date.localeCompare(b.date));
};

/** Un evento está agotado si lo marcaron, si no le quedan tipos a la venta o
 *  si ya venció su cierre. Mismo criterio que la tarjeta y que la página. */
export const eventoAgotado = (e: AdminEvent): boolean =>
  // Un evento de sólo consulta (v31) no vende entradas, pero tampoco está agotado.
  !e.consultOnly &&
  (e.status === "agotado" ||
  e.tickets.filter((t) => t.active).length === 0 ||
  (e.saleEndsAt ? new Date() >= new Date(e.saleEndsAt) : false));

/**
 * Lo que el carrusel dibuja: un evento suelto o un grupo colapsado en una
 * tarjeta.
 *
 * `dias` tiene SIEMPRE al menos un elemento; para un evento suelto es él solo.
 * Así el carrusel no necesita dos ramas: pinta lo que diga la entrada y listo.
 */
export interface EntradaCarrusel {
  /** Clave de React y del scroll. El id del primer día, o la clave del grupo. */
  key: string;
  /** El día al que lleva la tarjeta: el primero que todavía venda. */
  destino: AdminEvent;
  /** Lo que muestra la tarjeta. Para un grupo, el nombre del grupo. */
  nombre: string;
  /** "31 OCT – 2 NOV" si son varios días; la fecha sola si es uno. */
  fecha: string;
  /** Vacío si los días no coinciden: decir uno solo sería mentir. */
  lugar: string;
  /** Los días. Uno solo para un evento suelto. */
  dias: AdminEvent[];
  /** Agotado sólo si lo están TODOS los días. */
  agotado: boolean;
}

const unicos = (valores: string[]) => [...new Set(valores.filter(Boolean))];

/**
 * Colapsa los eventos agrupados en una sola entrada por grupo.
 *
 * Mantiene el orden por fecha: un grupo se ubica donde está su primer día, que
 * es lo que uno espera al mirar el carrusel. Los eventos sin `groupKey` pasan
 * tal cual, así que el día que nadie agrupe nada esto es la identidad.
 */
export const agruparEventos = (events: AdminEvent[]): EntradaCarrusel[] => {
  const ordenados = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const vistos = new Set<string>();
  const salida: EntradaCarrusel[] = [];

  for (const e of ordenados) {
    if (!e.groupKey) {
      salida.push({
        key: e.id,
        destino: e,
        nombre: e.name,
        fecha: rangoDeFechas([e.date]),
        lugar: e.location,
        dias: [e],
        agotado: eventoAgotado(e),
      });
      continue;
    }

    if (vistos.has(e.groupKey)) continue;
    vistos.add(e.groupKey);

    // Ya están ordenados por fecha, así que filtrar conserva el orden.
    const dias = ordenados.filter((d) => d.groupKey === e.groupKey);
    const lugares = unicos(dias.map((d) => d.location));

    salida.push({
      key: `grupo:${e.groupKey}`,
      // Se entra por el primer día que todavía venda: mandar a alguien a un
      // día agotado cuando los otros dos tienen entradas es perder la venta.
      // Si están todos agotados da igual, va el primero.
      destino: dias.find((d) => !eventoAgotado(d)) ?? dias[0],
      // El nombre del grupo está repetido en sus días (v26). Gana el del día
      // más temprano; si ninguno lo tiene, el nombre de ese día.
      nombre: dias.find((d) => d.groupName)?.groupName ?? dias[0].name,
      fecha: rangoDeFechas(dias.map((d) => d.date)),
      // Un solo lugar o nada. "Ruta 90 km 6" cuando dos de los tres días son
      // en otro lado es peor que no decir dónde: el que lee no vuelve a mirar.
      lugar: lugares.length === 1 ? lugares[0] : "",
      dias,
      agotado: dias.every(eventoAgotado),
    });
  }

  return salida;
};

/**
 * Nombre de fiesta → clave de grupo.
 *
 * Espeja a `slugify()` de v25, que es lo que el trigger de v26 aplica al
 * guardar. **La corrección no depende de esto** —la DB normaliza igual, así
 * que dos eventos cargados como "Halloween XXL" y "halloween-xxl" terminan en
 * la misma clave— pero sin esto el desplegable del panel no reconocería el
 * grupo recién tipeado hasta recargar.
 */
export const claveDeGrupo = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** Los grupos que ya existen, para ofrecerlos en el panel. */
export const gruposExistentes = (
  events: AdminEvent[]
): Array<{ key: string; nombre: string; dias: number }> => {
  const mapa = new Map<string, { key: string; nombre: string; dias: number }>();
  for (const e of events) {
    if (!e.groupKey) continue;
    const previo = mapa.get(e.groupKey);
    if (previo) previo.dias += 1;
    else mapa.set(e.groupKey, { key: e.groupKey, nombre: e.groupName || e.name, dias: 1 });
  }
  return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre));
};
