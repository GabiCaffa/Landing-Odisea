import { supabase, ID_PHOTOS_BUCKET } from "@/lib/supabase";
import { compressImageToBlob } from "@/contexts/AuthContext";

/**
 * Promo cumpleaños: cumpleañeros cargados por el staff (admin u operador) con
 * su foto de documento, y el control de a quién ya se le dio el regalo.
 * Tabla public.birthday_signups (sólo staff vía RLS).
 * Ver supabase/v12_birthday_signups.sql.
 *
 * La foto del documento vive en un bucket PRIVADO: guardamos la RUTA del archivo
 * (no una URL pública) y la mostramos con URLs firmadas de corta duración.
 */

/**
 * 'aprobado' = cargado o validado por el staff (todo lo previo a v16).
 * 'pendiente' = lo cargó el propio cliente y falta revisarlo.
 */
export type BirthdayStatus = "pendiente" | "aprobado" | "rechazado";

export interface BirthdaySignup {
  id: string;
  status: BirthdayStatus;
  /** Evento al que va (opcional: se puede cargar antes de definirlo). */
  eventId?: string;
  /** Si es un usuario registrado, su id de perfil. null si es carga manual. */
  userId?: string;
  firstName: string;
  lastName: string;
  documentId: string;
  birthDate: string; // ISO yyyy-mm-dd
  email?: string;
  phone?: string; // E.164
  country?: string;
  state?: string;
  /** Ruta dentro del bucket privado id-photos. */
  idPhotoPath?: string;
  giftGiven: boolean;
  giftGivenAt?: string;
  notes?: string;
  createdAt: string;
}

/** Campos editables al crear/actualizar un cumpleañero. */
export interface BirthdayInput {
  eventId?: string | null;
  userId?: string | null;
  firstName: string;
  lastName: string;
  documentId: string;
  birthDate: string;
  email?: string | null;
  phone?: string | null;
  country?: string | null;
  state?: string | null;
  idPhotoPath?: string | null;
  giftGiven?: boolean;
  notes?: string | null;
}

function fromDb(row: any): BirthdaySignup {
  return {
    id: row.id,
    status: (row.status ?? "aprobado") as BirthdayStatus,
    eventId: row.event_id ?? undefined,
    userId: row.user_id ?? undefined,
    firstName: row.first_name,
    lastName: row.last_name,
    documentId: row.document_id,
    birthDate: row.birth_date,
    email: row.email ?? undefined,
    phone: row.phone ?? undefined,
    country: row.country ?? undefined,
    state: row.state ?? undefined,
    idPhotoPath: row.id_photo_path ?? undefined,
    giftGiven: !!row.gift_given,
    giftGivenAt: row.gift_given_at ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

function toDb(input: Partial<BirthdayInput>): Record<string, any> {
  const out: Record<string, any> = {};
  if (input.eventId !== undefined) out.event_id = input.eventId || null;
  if (input.userId !== undefined) out.user_id = input.userId || null;
  if (input.firstName !== undefined) out.first_name = input.firstName;
  if (input.lastName !== undefined) out.last_name = input.lastName;
  if (input.documentId !== undefined) out.document_id = input.documentId;
  if (input.birthDate !== undefined) out.birth_date = input.birthDate;
  if (input.email !== undefined) out.email = input.email || null;
  if (input.phone !== undefined) out.phone = input.phone || null;
  if (input.country !== undefined) out.country = input.country || null;
  if (input.state !== undefined) out.state = input.state || null;
  if (input.idPhotoPath !== undefined) out.id_photo_path = input.idPhotoPath || null;
  if (input.giftGiven !== undefined) out.gift_given = input.giftGiven;
  if (input.notes !== undefined) out.notes = input.notes || null;
  return out;
}

// El trigger de la DB rechaza menores de 18; traducimos ese error a algo legible.
function humanizeError(message: string): string {
  if (message.toLowerCase().includes("mayor de 18")) {
    return "La fecha de nacimiento indica que es menor de 18 años";
  }
  return message;
}

export async function fetchBirthdays(): Promise<BirthdaySignup[]> {
  const { data, error } = await supabase
    .from("birthday_signups")
    .select("*")
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(fromDb);
}

export async function createBirthday(
  input: BirthdayInput
): Promise<{ ok: boolean; error?: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const row = { ...toDb(input), created_by: auth.user?.id ?? null };
  const { error } = await supabase.from("birthday_signups").insert(row);
  if (error) return { ok: false, error: humanizeError(error.message) };
  return { ok: true };
}

export async function updateBirthday(
  id: string,
  patch: Partial<BirthdayInput>
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("birthday_signups").update(toDb(patch)).eq("id", id);
  if (error) return { ok: false, error: humanizeError(error.message) };
  return { ok: true };
}

/** Borra el registro y, best-effort, la foto de documento asociada. */
export async function deleteBirthday(
  row: BirthdaySignup
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from("birthday_signups").delete().eq("id", row.id);
  if (error) return { ok: false, error: error.message };
  if (row.idPhotoPath) await removeIdPhoto(row.idPhotoPath);
  return { ok: true };
}

/** Aprobar o rechazar una solicitud cargada por el propio cliente. */
export async function setBirthdayStatus(
  id: string,
  status: BirthdayStatus
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("birthday_signups")
    .update({ status })
    .eq("id", id);
  if (error) return { ok: false, error: humanizeError(error.message) };
  return { ok: true };
}

// ─── Autogestión del cliente (usuario registrado) ────────────────────────────

/**
 * Solicitud cargada por el propio cliente desde el sitio. Entra como
 * 'pendiente' y a nombre suyo: la política de RLS rechaza cualquier otra
 * combinación, así que esto no es una validación cosmética (ver v16).
 */
export async function createBirthdayRequest(
  input: Omit<BirthdayInput, "userId" | "giftGiven">
): Promise<{ ok: boolean; error?: string }> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return { ok: false, error: "Iniciá sesión para enviar la solicitud" };

  const row = {
    ...toDb({ ...input, userId: uid, giftGiven: false }),
    status: "pendiente",
    created_by: uid,
  };
  const { error } = await supabase.from("birthday_signups").insert(row);
  if (error) {
    // Los índices únicos parciales de v16 frenan las solicitudes repetidas.
    if (error.code === "23505") {
      return { ok: false, error: "Ya tenés una solicitud pendiente para ese evento" };
    }
    return { ok: false, error: humanizeError(error.message) };
  }
  return { ok: true };
}

/**
 * Solicitudes propias del usuario logueado. El filtro por user_id es explícito
 * a propósito: la política select_own ya alcanzaría, pero si quien consulta es
 * staff su política le devolvería la tabla entera.
 */
export async function fetchMyBirthdayRequests(): Promise<BirthdaySignup[]> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from("birthday_signups")
    .select("*")
    .eq("user_id", uid)
    .order("created_at", { ascending: false });
  if (error || !data) return [];
  return data.map(fromDb);
}

/** Marca/desmarca el regalo como entregado (el trigger sella gift_given_at). */
export async function setGiftGiven(
  id: string,
  giftGiven: boolean
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from("birthday_signups")
    .update({ gift_given: giftGiven })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Foto del documento (bucket privado) ─────────────────────────────────────

/**
 * Sube la foto del frente del documento y devuelve su RUTA en el bucket privado.
 * 1400px es suficiente para leer los datos de una cédula sin subir 5 MB.
 */
export async function uploadIdPhoto(
  file: File
): Promise<{ ok: boolean; path?: string; error?: string }> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return { ok: false, error: "Sesión vencida, volvé a entrar" };
    const blob = await compressImageToBlob(file, 1400, 0.85);
    // La carpeta es el uid: la política de storage sólo deja escribir en la
    // propia, así que un cliente no puede pisar el archivo de otro (v16).
    const path = `${auth.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
    const { error } = await supabase.storage
      .from(ID_PHOTOS_BUCKET)
      .upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) return { ok: false, error: error.message };
    return { ok: true, path };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/** Borra el archivo físico. Best-effort: no rompe el flujo si falla. */
export async function removeIdPhoto(path: string): Promise<void> {
  try {
    await supabase.storage.from(ID_PHOTOS_BUCKET).remove([path]);
  } catch {
    /* ignoramos errores de borrado del archivo */
  }
}

/**
 * URL firmada temporal para ver la foto. El bucket es privado, así que este
 * link es la única forma de abrirla y vence solo (5 minutos por defecto).
 */
export async function getIdPhotoUrl(
  path: string,
  expiresInSeconds = 300
): Promise<{ ok: boolean; url?: string; error?: string }> {
  const { data, error } = await supabase.storage
    .from(ID_PHOTOS_BUCKET)
    .createSignedUrl(path, expiresInSeconds);
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo abrir la foto" };
  return { ok: true, url: data.signedUrl };
}
