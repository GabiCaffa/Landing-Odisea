/**
 * Cuentas de la Historia de ODÍSEA (v47), sin base ni React: el resumen de un
 * evento, el ranking de compradores y la lectura de las planillas viejas.
 * Separado para poder probarlo solo (`scripts/probar-historia.mjs`).
 */

// ─── Personas ───────────────────────────────────────────────────────────────

const fold = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim()
    .toLowerCase();

export const normEmail = (e?: string | null) => {
  const v = (e ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : "";
};

/** "098 398 480" / "598 98 398 480" / "+59898398480" → "59898398480". */
export const normTelefono = (t?: string | null) => {
  const d = (t ?? "").replace(/\D/g, "");
  if (d.length < 8) return "";
  if (d.startsWith("598")) return d;
  if (d.startsWith("0")) return `598${d.slice(1)}`;
  if (d.length === 8) return `598${d}`;
  return d;
};

export const normDocumento = (d?: string | null) => {
  const v = (d ?? "").replace(/\D/g, "");
  return v.length >= 6 ? v : "";
};

export interface Comprador {
  name: string;
  email?: string | null;
  phone?: string | null;
  documentId?: string | null;
  entradas: number;
  monto: number;
}

/**
 * Agrupa filas que son la MISMA persona: comparten mail, teléfono o documento.
 * No alcanza con el mail: en una planilla vieja alguien figura con su mail y
 * en otra sólo con el teléfono. Union-find: si A comparte mail con B y B
 * comparte teléfono con C, los tres son uno.
 */
export function agruparPersonas<T extends Omit<Comprador, "entradas" | "monto">>(filas: T[]): T[][] {
  const padre = filas.map((_, i) => i);
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  const unir = (a: number, b: number) => {
    const ra = raiz(a);
    const rb = raiz(b);
    if (ra !== rb) padre[rb] = ra;
  };
  const vistos = new Map<string, number>();
  filas.forEach((f, i) => {
    const claves = [
      normEmail(f.email) && `m:${normEmail(f.email)}`,
      normTelefono(f.phone) && `t:${normTelefono(f.phone)}`,
      normDocumento(f.documentId) && `d:${normDocumento(f.documentId)}`,
    ].filter(Boolean) as string[];
    // Sin ningún dato de contacto, sólo el nombre: es lo que hay en algunas
    // planillas. Es más débil (dos "Juan Pérez" se juntan), pero perderlo es peor.
    if (claves.length === 0 && fold(f.name)) claves.push(`n:${fold(f.name)}`);
    for (const c of claves) {
      const otro = vistos.get(c);
      if (otro === undefined) vistos.set(c, i);
      else unir(otro, i);
    }
  });
  const grupos = new Map<number, T[]>();
  filas.forEach((f, i) => {
    const r = raiz(i);
    grupos.set(r, [...(grupos.get(r) ?? []), f]);
  });
  return [...grupos.values()];
}

// ─── Resumen de un evento desde sus ventas ──────────────────────────────────

export interface VentaParaHistoria {
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  documentId?: string | null;
  quantity: number;
  value: number;
  tickets: { name: string; quantity: number; unitPrice: number }[];
}

export interface TipoHistoria {
  nombre: string;
  entradas: number;
  recaudado: number;
}

export interface ResumenEvento {
  ventas: number;
  entradas: number;
  recaudado: number;
  compradores: Comprador[];
  porTipo: TipoHistoria[];
}

const redondo = (n: number) => Math.round(n * 100) / 100;

/**
 * Los números de un evento a partir de sus ventas CONFIRMADAS (las por
 * confirmar no son ventas, v40). El recaudado por tipo reparte el total de
 * cada venta según el precio de lista de cada línea: así los tipos suman
 * exactamente lo cobrado aunque haya habido promo.
 */
export function resumenDeVentas(ventas: VentaParaHistoria[]): ResumenEvento {
  const tipos = new Map<string, TipoHistoria>();
  const sumar = (nombre: string, entradas: number, recaudado: number) => {
    const t = tipos.get(nombre) ?? { nombre, entradas: 0, recaudado: 0 };
    t.entradas += entradas;
    t.recaudado += recaudado;
    tipos.set(nombre, t);
  };
  for (const v of ventas) {
    const lista = v.tickets.reduce((a, l) => a + l.quantity * l.unitPrice, 0);
    if (v.tickets.length === 0) sumar("Sin tipo", v.quantity, v.value);
    else
      for (const l of v.tickets) {
        const parte = lista > 0 ? (l.quantity * l.unitPrice) / lista : 1 / v.tickets.length;
        sumar(l.name, l.quantity, v.value * parte);
      }
  }
  const compradores = agruparPersonas(
    ventas.map((v) => ({
      name: `${v.firstName} ${v.lastName}`.trim(),
      email: v.email,
      phone: v.phone,
      documentId: v.documentId,
      entradas: v.quantity,
      monto: v.value,
    }))
  ).map((g) => ({
    name: g[0].name,
    email: g.find((x) => normEmail(x.email))?.email ?? null,
    phone: g.find((x) => normTelefono(x.phone))?.phone ?? null,
    documentId: g.find((x) => normDocumento(x.documentId))?.documentId ?? null,
    entradas: g.reduce((a, x) => a + x.entradas, 0),
    monto: redondo(g.reduce((a, x) => a + x.monto, 0)),
  }));
  return {
    ventas: ventas.length,
    entradas: ventas.reduce((a, v) => a + v.quantity, 0),
    recaudado: redondo(ventas.reduce((a, v) => a + v.value, 0)),
    compradores,
    porTipo: [...tipos.values()]
      .map((t) => ({ ...t, recaudado: redondo(t.recaudado) }))
      .sort((a, b) => b.entradas - a.entradas),
  };
}

// ─── Ranking ────────────────────────────────────────────────────────────────

export interface CompradorGuardado extends Comprador {
  historyId: string;
}

export interface EventoGuardado {
  id: string;
  name: string;
  eventDate?: string | null;
}

export interface PuestoRanking {
  puesto: number;
  name: string;
  email: string | null;
  phone: string | null;
  documentId: string | null;
  eventos: number;
  entradas: number;
  monto: number;
  /** Los eventos a los que compró, del más nuevo al más viejo. */
  fiestas: EventoGuardado[];
}

/**
 * Los que más van: se ordena por cantidad de EVENTOS distintos en los que
 * compró (es lo que mide "ir a las fiestas"), y desempatan las entradas y
 * después la plata. Ojo: mide al que COMPRA; quien compra 4 entradas para sus
 * amigos cuenta una vez por evento, y los amigos no aparecen.
 */
export function rankingCompradores(compradores: CompradorGuardado[], eventos: EventoGuardado[]): PuestoRanking[] {
  const evento = new Map(eventos.map((e) => [e.id, e]));
  const lista = agruparPersonas(compradores).map((g) => {
    const ids = [...new Set(g.map((x) => x.historyId))];
    const fiestas = ids
      .map((id) => evento.get(id))
      .filter((e): e is EventoGuardado => Boolean(e))
      .sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? ""));
    // El nombre del evento más nuevo: es como se presenta hoy.
    const masNueva = g.find((x) => x.historyId === fiestas[0]?.id) ?? g[0];
    return {
      puesto: 0,
      name: masNueva.name || g.find((x) => x.name)?.name || "",
      email: g.find((x) => normEmail(x.email))?.email ?? null,
      phone: g.find((x) => normTelefono(x.phone))?.phone ?? null,
      documentId: g.find((x) => normDocumento(x.documentId))?.documentId ?? null,
      eventos: ids.length,
      entradas: g.reduce((a, x) => a + x.entradas, 0),
      monto: redondo(g.reduce((a, x) => a + Number(x.monto), 0)),
      fiestas,
    };
  });
  lista.sort((a, b) => b.eventos - a.eventos || b.entradas - a.entradas || b.monto - a.monto);
  // Empatados en eventos y entradas comparten el puesto.
  lista.forEach((p, i) => {
    const prev = lista[i - 1];
    p.puesto = prev && prev.eventos === p.eventos && prev.entradas === p.entradas ? prev.puesto : i + 1;
  });
  return lista;
}

// ─── Planillas viejas ───────────────────────────────────────────────────────

/** "$1.500" / "1500,50" → número. Misma regla que `parseMoney` del panel. */
export function plata(raw: unknown): number | null {
  if (typeof raw === "number") return raw;
  const clean = String(raw ?? "").replace(/[^\d.,]/g, "");
  if (!clean) return null;
  const sep = Math.max(clean.lastIndexOf("."), clean.lastIndexOf(","));
  if (sep === -1) return Number(clean);
  const decimales = clean.length - sep - 1;
  if (decimales === 3 || decimales === 0) return Number(clean.replace(/[.,]/g, ""));
  return Number(`${clean.slice(0, sep).replace(/[.,]/g, "") || "0"}.${clean.slice(sep + 1)}`);
}

export interface HojaLeida {
  nombre: string;
  ventas: VentaParaHistoria[];
  avisos: string[];
}

/**
 * Lee una hoja de la planilla de siempre ("Odisea Venta …", una hoja por
 * fiesta): mismo criterio que `scripts/planilla-a-sql.mjs`. El encabezado es
 * la primera fila con "Nombre del comprador"; el total es la columna sin
 * título anterior al nombre; las filas sin nombre ni mail son de plantilla.
 * Devuelve null si la hoja no es una de ventas (por ejemplo "Resumen").
 */
export function leerHoja(nombre: string, filas: unknown[][]): HojaLeida | null {
  const enc = filas.findIndex((r) => r.some((c) => fold(c).includes("nombre del comprador")));
  if (enc === -1) return null;
  const h = filas[enc].map(fold);
  const col = (...n: string[]) => h.findIndex((x) => n.some((y) => x.includes(y)));
  const iNombre = col("nombre del comprador");
  const iUnit = col("precio unitario");
  const iTel = col("telefono");
  const iMail = col("mail", "email");
  const iTipo = col("tipo de entrada");
  const iCant = col("cantidad");
  const iDoc = col("documento", "cedula");
  // "precio total" y no "total" suelto: la planilla exportada tiene "TOTAL VENTA" al costado.
  const iTotalTit = col("precio total");
  const iTotal = iTotalTit !== -1 ? iTotalTit : iNombre > 0 ? iNombre - 1 : -1;
  const avisos: string[] = [];
  const ventas: VentaParaHistoria[] = [];
  for (const r of filas.slice(enc + 1)) {
    const n = String(r[iNombre] ?? "").trim();
    const mail = iMail === -1 ? "" : String(r[iMail] ?? "").trim();
    const tel = iTel === -1 ? "" : String(r[iTel] ?? "").trim();
    if (!n && !mail && !tel) continue;
    const cant = parseInt(String(r[iCant] ?? "").replace(/\D/g, ""), 10) || 1;
    const unit = iUnit === -1 ? null : plata(r[iUnit]);
    const total = iTotal === -1 ? null : plata(r[iTotal]);
    const valor = total ?? (unit !== null ? unit * cant : 0);
    if (!total && unit === null) avisos.push(`"${n || mail}" no tiene precio: va con $0`);
    const [first = n, ...rest] = n.split(/\s+/).filter(Boolean);
    const tipo = iTipo === -1 ? "" : String(r[iTipo] ?? "").trim();
    ventas.push({
      firstName: first,
      lastName: rest.join(" "),
      email: mail || null,
      phone: tel || null,
      documentId: iDoc === -1 ? null : String(r[iDoc] ?? "").trim() || null,
      quantity: cant,
      value: valor,
      tickets: tipo ? [{ name: tipo, quantity: cant, unitPrice: unit ?? valor / cant }] : [],
    });
  }
  if (ventas.length === 0) return null;
  return { nombre: nombre.trim(), ventas, avisos };
}

/** Una fecha que aparezca en el nombre de la hoja ("Halloween 31/10/2025" → "2025-10-31"). */
export function fechaDelNombre(nombre: string): string {
  const m = /(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?/.exec(nombre);
  if (!m) return "";
  const dia = m[1].padStart(2, "0");
  const mes = m[2].padStart(2, "0");
  const anio = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : "";
  return anio && Number(mes) <= 12 && Number(dia) <= 31 ? `${anio}-${mes}-${dia}` : "";
}
