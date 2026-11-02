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

/** El concurso que muestra la web: el más reciente que no sea borrador. */
export async function fetchConcursoVisible(): Promise<Concurso | null> {
  const { data, error } = await supabase
    .from("contests")
    .select("*")
    .neq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1);
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

export async function createConcurso(c: { title: string; description: string }): Promise<string> {
  const { data, error } = await supabase
    .from("contests")
    .insert({ title: c.title, description: c.description, status: "draft" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function updateConcurso(
  id: string,
  c: Partial<{ title: string; description: string; status: EstadoConcurso; closesAt: string }>
): Promise<void> {
  const out: Record<string, unknown> = {};
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
 * Para la home: ¿hay una votación abierta ahora? Una sola consulta por carga
 * de página. `null` = todavía no contestó o no hay.
 */
let pendiente: Promise<Concurso | null> | null = null;

export const useConcursoAbierto = (): Concurso | null => {
  const [concurso, setConcurso] = useState<Concurso | null>(null);
  useEffect(() => {
    let vivo = true;
    pendiente ??= fetchConcursoVisible().catch(() => null);
    pendiente.then((c) => vivo && setConcurso(c && estaAbierto(c) ? c : null));
    return () => {
      vivo = false;
    };
  }, []);
  return concurso;
};
