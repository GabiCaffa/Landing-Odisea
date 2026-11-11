import { supabase } from "@/lib/supabase";
import { traerTodo } from "@/lib/traerTodo";
import type { Comprador, CompradorGuardado, HojaLeida, ResumenEvento, TipoHistoria } from "@/lib/historiaCalculo";

/**
 * Historia de ODÍSEA (v47): los eventos con sus números congelados y sus
 * compradores. Las cuentas viven en `historiaCalculo.ts`; acá sólo se lee y se
 * escribe en la base.
 */

export interface EventoHistoria {
  id: string;
  eventId: string | null;
  name: string;
  eventDate: string | null;
  location: string | null;
  origin: "panel" | "planilla";
  ventas: number;
  entradas: number;
  recaudado: number;
  compradores: number;
  porTipo: TipoHistoria[];
  cumpleaneros: number;
  savedAt: string;
}

interface FilaHistoria {
  id: string;
  event_id: string | null;
  name: string;
  event_date: string | null;
  location: string | null;
  origin: "panel" | "planilla";
  ventas: number;
  entradas: number;
  recaudado: number | string;
  compradores: number;
  por_tipo: TipoHistoria[] | null;
  cumpleaneros: number;
  saved_at: string;
}

interface FilaComprador {
  id: string;
  history_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  document_id: string | null;
  entradas: number;
  monto: number | string;
}

const desdeFila = (r: FilaHistoria): EventoHistoria => ({
  id: r.id,
  eventId: r.event_id,
  name: r.name,
  eventDate: r.event_date,
  location: r.location,
  origin: r.origin,
  ventas: r.ventas,
  entradas: r.entradas,
  recaudado: Number(r.recaudado),
  compradores: r.compradores,
  porTipo: r.por_tipo ?? [],
  cumpleaneros: r.cumpleaneros,
  savedAt: r.saved_at,
});

const faltaMigracion = (m: string) => /event_history/i.test(m) && /(does not exist|not find|schema cache)/i.test(m);
export const AVISO_V47 = "Falta correr la migración v47 (Historia de ODÍSEA).";

/** La historia, del evento más nuevo al más viejo. `null` si falta v47. */
export async function fetchHistoria(): Promise<EventoHistoria[] | null> {
  try {
    const filas = await traerTodo<FilaHistoria>((desde, hasta) =>
      supabase
        .from("event_history")
        .select("*")
        .order("event_date", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(desde, hasta)
    );
    return filas.map(desdeFila);
  } catch (e) {
    if (faltaMigracion((e as Error).message)) return null;
    throw e;
  }
}

export async function fetchCompradoresHistoria(): Promise<CompradorGuardado[]> {
  const filas = await traerTodo<FilaComprador>((desde, hasta) =>
    supabase.from("event_history_buyers").select("*").order("id", { ascending: true }).range(desde, hasta)
  );
  return filas.map((r) => ({
    historyId: r.history_id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    documentId: r.document_id,
    entradas: r.entradas,
    monto: Number(r.monto),
  }));
}

export interface DatosGuardado {
  /** La fila que se reemplaza (volver a guardar), si ya existe. */
  existenteId?: string;
  eventId: string | null;
  name: string;
  eventDate: string | null;
  location: string | null;
  origin: "panel" | "planilla";
  resumen: ResumenEvento;
  cumpleaneros?: number;
}

/**
 * Guarda (o reemplaza) un evento con sus compradores. Primero la fila del
 * evento y después los compradores: si éstos fallan, el evento queda con sus
 * números y se puede volver a guardar.
 */
export async function guardarEnHistoria(d: DatosGuardado): Promise<{ ok: boolean; error?: string }> {
  const fila = {
    event_id: d.eventId,
    name: d.name.trim(),
    event_date: d.eventDate || null,
    location: d.location || null,
    origin: d.origin,
    ventas: d.resumen.ventas,
    entradas: d.resumen.entradas,
    recaudado: d.resumen.recaudado,
    compradores: d.resumen.compradores.length,
    por_tipo: d.resumen.porTipo,
    cumpleaneros: d.cumpleaneros ?? 0,
    saved_at: new Date().toISOString(),
  };
  const { data, error } = d.existenteId
    ? await supabase.from("event_history").update(fila).eq("id", d.existenteId).select("id").single()
    : await supabase.from("event_history").insert(fila).select("id").single();
  if (error || !data) {
    const m = error?.message ?? "No se pudo guardar";
    return { ok: false, error: faltaMigracion(m) ? AVISO_V47 : m };
  }
  const id = (data as { id: string }).id;

  const borrar = await supabase.from("event_history_buyers").delete().eq("history_id", id);
  if (borrar.error) return { ok: false, error: borrar.error.message };
  const filas = d.resumen.compradores.map((c: Comprador) => ({
    history_id: id,
    name: c.name,
    email: c.email || null,
    phone: c.phone || null,
    document_id: c.documentId || null,
    entradas: c.entradas,
    monto: c.monto,
  }));
  for (let i = 0; i < filas.length; i += 500) {
    const { error: e } = await supabase.from("event_history_buyers").insert(filas.slice(i, i + 500));
    if (e) return { ok: false, error: `Se guardó el evento pero no todos sus compradores: ${e.message}` };
  }
  return { ok: true };
}

export async function borrarDeHistoria(id: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("event_history").delete().eq("id", id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/**
 * Lee un .xlsx (la planilla de siempre, una hoja por fiesta). `exceljs` se
 * baja recién acá, en su propio chunk, como en el botón Excel de Entregas.
 */
export async function leerPlanillaExcel(file: File): Promise<HojaLeida[]> {
  const [{ default: ExcelJS }, { leerHoja }] = await Promise.all([import("exceljs"), import("@/lib/historiaCalculo")]);
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await file.arrayBuffer());
  const hojas: HojaLeida[] = [];
  libro.eachSheet((hoja) => {
    const filas: unknown[][] = [];
    hoja.eachRow({ includeEmpty: true }, (row) => {
      const celdas: unknown[] = [];
      row.eachCell({ includeEmpty: true }, (celda, col) => {
        const v = celda.value;
        // Los números quedan números; fórmulas, links y texto con formato van
        // por lo que se VE en la celda.
        celdas[col - 1] = typeof v === "number" ? v : celda.text;
      });
      filas.push(celdas);
    });
    const leida = leerHoja(hoja.name, filas);
    if (leida) hojas.push(leida);
  });
  return hojas;
}
