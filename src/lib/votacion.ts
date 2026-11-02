import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { compressImageToBlob } from "@/contexts/AuthContext";
import { GALERIA_BUCKET } from "@/lib/galeria";

/**
 * Votación de disfraces (v35). Lectura pública de los concursos que no son
 * borrador; escritura del staff; el voto SÓLO por `cast_vote()` (ver la
 * migración: la base valida sesión, perfil, estado y cierre).
 */

export type EstadoConcurso = "draft" | "open" | "closed";

export interface Concurso {
  id: string;
  /** v36: dirección propia (/votacion/colonia). Vacío = se abre por su id. */
  slug?: string;
  title: string;
  description: string;
  status: EstadoConcurso;
  closesAt?: string;
  createdAt: string;
}

export interface Participante {
  id: string;
  contestId: string;
  photoUrl: string;
  label: string;
  sortOrder: number;
  active: boolean;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const concursoDesdeDb = (r: any): Concurso => ({
  id: r.id,
  slug: r.slug ?? undefined,
  title: r.title,
  description: r.description ?? "",
  status: r.status,
  closesAt: r.closes_at ?? undefined,
  createdAt: r.created_at,
});

const participanteDesdeDb = (r: any): Participante => ({
  id: r.id,
  contestId: r.contest_id,
  photoUrl: r.photo_url,
  label: r.label ?? "",
  sortOrder: r.sort_order,
  active: r.active,
});

/**
 * ¿Se puede votar ahora? `open` no alcanza: pasada la hora de cierre la base
 * rechaza el voto aunque el estado siga en `open`, así que la pantalla tiene
 * que decir lo mismo que la base.
 */
export const estaAbierto = (c: Concurso, ahora = Date.now()): boolean =>
  c.status === "open" && !(c.closesAt && ahora >= Date.parse(c.closesAt));

/** Dónde vive una votación. Con dos a la vez, cada una tiene su propia página. */
export const rutaDeConcurso = (c: Pick<Concurso, "id" | "slug">) => `/votacion/${c.slug || c.id}`;

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Las votaciones que muestra la web: las que no son borrador, la más reciente
 * primero. Puede haber varias a la vez (por ejemplo, una por ciudad).
 */
export async function fetchConcursosVisibles(): Promise<Concurso[]> {
  const { data, error } = await supabase
    .from("contests")
    .select("*")
    .neq("status", "draft")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(concursoDesdeDb);
}

/**
 * Una votación por su dirección (`colonia`) o por su id. Si la clave parece un
 * uuid se busca SÓLO por id: así funciona aunque la migración v36 (la columna
 * `slug`) todavía no esté corrida.
 */
export async function fetchConcursoPorClave(clave: string): Promise<Concurso | null> {
  const q = supabase.from("contests").select("*").neq("status", "draft");
  const { data, error } = await (ES_UUID.test(clave) ? q.eq("id", clave) : q.eq("slug", clave)).limit(1);
  if (error) throw error;
  return data?.[0] ? concursoDesdeDb(data[0]) : null;
}

export async function fetchParticipantes(contestId: string): Promise<Participante[]> {
  const { data, error } = await supabase
    .from("contest_entries")
    .select("*")
    .eq("contest_id", contestId)
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map(participanteDesdeDb);
}

/** `{ idParticipante: votos }`. Públicos, sin decir quién votó. */
export async function fetchConteos(contestId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc("contest_results", { p_contest: contestId });
  if (error) throw error;
  return Object.fromEntries(((data ?? []) as any[]).map((r) => [r.entry_id, Number(r.votes)]));
}

/** El voto de la persona en sesión, o null. Cada quien sólo puede leer el suyo. */
export async function fetchMiVoto(contestId: string, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("contest_votes")
    .select("entry_id")
    .eq("contest_id", contestId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data?.entry_id ?? null;
}

/** Traduce los errores de `cast_vote()` a algo que se pueda leer. */
export const mensajeDeVoto = (err: unknown): string => {
  const m = (err as { message?: string } | null)?.message ?? "";
  if (m.includes("login_required")) return "Ingresá a tu cuenta para votar.";
  if (m.includes("profile_required")) return "Confirmá tu email para poder votar.";
  if (m.includes("voting_closed")) return "La votación ya cerró.";
  if (m.includes("entry_not_found")) return "Esa foto ya no está en la votación.";
  return "No se pudo registrar tu voto. Probá de nuevo.";
};

export async function votar(entryId: string): Promise<void> {
  const { error } = await supabase.rpc("cast_vote", { p_entry: entryId });
  if (error) throw error;
}

// ── Panel ────────────────────────────────────────────────────────────────────

export async function fetchConcursos(): Promise<Concurso[]> {
  const { data, error } = await supabase
    .from("contests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(concursoDesdeDb);
}

export async function createConcurso(c: {
  title: string;
  description: string;
  slug?: string;
}): Promise<string> {
  const { data, error } = await supabase
    .from("contests")
    // `slug` sólo viaja si hay uno: sin la migración v36 la columna no existe.
    .insert({ title: c.title, description: c.description, status: "draft", ...(c.slug ? { slug: c.slug } : {}) })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateConcurso(
  id: string,
  c: Partial<{ title: string; description: string; status: EstadoConcurso; closesAt: string; slug: string }>
): Promise<void> {
  const out: Record<string, unknown> = {};
  if (c.slug !== undefined) out.slug = c.slug || null;
  if (c.title !== undefined) out.title = c.title;
  if (c.description !== undefined) out.description = c.description;
  if (c.status !== undefined) out.status = c.status;
  if (c.closesAt !== undefined) out.closes_at = c.closesAt || null;
  const { error } = await supabase.from("contests").update(out).eq("id", id);
  if (error) throw error;
}

/** Todos los participantes del concurso (también los desactivados), para el panel. */
export async function fetchTodosLosParticipantes(contestId: string): Promise<Participante[]> {
  const { data, error } = await supabase
    .from("contest_entries")
    .select("*")
    .eq("contest_id", contestId)
    .order("sort_order");
  if (error) throw error;
  return (data ?? []).map(participanteDesdeDb);
}

export async function createParticipante(p: Omit<Participante, "id">): Promise<void> {
  const { error } = await supabase.from("contest_entries").insert({
    contest_id: p.contestId,
    photo_url: p.photoUrl,
    label: p.label,
    sort_order: p.sortOrder,
    active: p.active,
  });
  if (error) throw error;
}

export async function updateParticipante(
  id: string,
  p: Partial<Pick<Participante, "label" | "sortOrder" | "active" | "photoUrl">>
): Promise<void> {
  const out: Record<string, unknown> = {};
  if (p.label !== undefined) out.label = p.label;
  if (p.sortOrder !== undefined) out.sort_order = p.sortOrder;
  if (p.active !== undefined) out.active = p.active;
  if (p.photoUrl !== undefined) out.photo_url = p.photoUrl;
  const { error } = await supabase.from("contest_entries").update(out).eq("id", id);
  if (error) throw error;
}

const rutaEnBucket = (url: string): string | null => {
  const marca = `/${GALERIA_BUCKET}/`;
  const i = url.indexOf(marca);
  return i >= 0 ? decodeURIComponent(url.slice(i + marca.length).split("?")[0]) : null;
};

/** Borra la fila (y con ella sus votos, en cascada) y después el archivo. */
export async function deleteParticipante(p: Participante): Promise<void> {
  const { error } = await supabase.from("contest_entries").delete().eq("id", p.id);
  if (error) throw error;
  const ruta = rutaEnBucket(p.photoUrl);
  if (ruta) await supabase.storage.from(GALERIA_BUCKET).remove([ruta]).catch(() => undefined);
}

/**
 * Sube una foto al bucket `gallery` (v33), carpeta `disfraces/`: ya es público y
 * el staff ya puede subir y borrar ahí. Se achica a 1200 px: se ve a ~300 px en
 * la grilla y a pantalla completa en el visor.
 */
export async function uploadParticipante(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("El archivo tiene que ser una foto.");
  const blob = await compressImageToBlob(file, 1200, 0.85);
  const path = `disfraces/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
  const { error } = await supabase.storage
    .from(GALERIA_BUCKET)
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return supabase.storage.from(GALERIA_BUCKET).getPublicUrl(path).data.publicUrl;
}

/**
 * Para la home: las votaciones abiertas ahora (puede haber más de una). Una sola
 * consulta por carga de página. Vacío = todavía no contestó o no hay.
 */
let pendiente: Promise<Concurso[]> | null = null;

export const useConcursosAbiertos = (): Concurso[] => {
  const [concursos, setConcursos] = useState<Concurso[]>([]);
  useEffect(() => {
    let vivo = true;
    pendiente ??= fetchConcursosVisibles().catch(() => []);
    pendiente.then((cs) => vivo && setConcursos(cs.filter((c) => estaAbierto(c))));
    return () => {
      vivo = false;
    };
  }, []);
  return concursos;
};
