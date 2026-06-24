import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase, EVENT_IMAGES_BUCKET } from "@/lib/supabase";

export type UserRole = "admin" | "user";

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  birthDate: string;
  documentId: string;
  email: string;
  role: UserRole;
  avatarUrl?: string;
  phone?: string; // E.164
  country?: string; // ISO 3166-1 alpha-2
  state?: string;
  createdAt: string;
}

export interface ProfileUpdate {
  firstName?: string;
  lastName?: string;
  birthDate?: string;
  avatarUrl?: string | null;
  phone?: string | null;
  country?: string | null;
  state?: string | null;
}

export interface BirthdayCheck {
  canClaim: boolean;
  reason:
    | "no_auth"
    | "no_birth_date"
    | "no_event"
    | "birthday_too_far"
    | "cooldown"
    | "already_claimed"
    | "ok";
  nextAvailable?: string; // ISO yyyy-mm-dd
}

export const AVATARS_BUCKET = "avatars";

export type ImageFit = "cover" | "contain";

export interface ImageTransform {
  x: number;
  y: number;
  scale: number;
  fit: ImageFit;
}

export const DEFAULT_IMAGE_TRANSFORM: ImageTransform = {
  x: 50,
  y: 50,
  scale: 1,
  fit: "cover",
};

export interface AdminEvent {
  id: string;
  name: string;
  date: string;
  location: string;
  description: string;
  price: number;
  capacity: number;
  status: "activo" | "agotado" | "finalizado";
  /** ISO datetime. Pasado este momento la venta se cierra sola (queda "agotado"). */
  saleEndsAt?: string;
  image: string;
  imagePosition: ImageTransform;
  instagramUrl?: string;
  createdAt: string;
}

export type NewEventInput = Omit<AdminEvent, "id" | "createdAt">;

interface AuthResult {
  ok: boolean;
  error?: string;
  user?: User;
  needsEmailConfirmation?: boolean;
}

interface AuthContextValue {
  currentUser: User | null;
  users: User[];
  events: AdminEvent[];
  loading: boolean;
  login: (email: string, password: string) => Promise<AuthResult>;
  register: (data: {
    firstName: string;
    lastName: string;
    birthDate: string;
    documentId: string;
    email: string;
    password: string;
    phone: string;
    country: string;
    state?: string;
  }) => Promise<AuthResult>;
  checkBirthdayPromo: (eventId: string) => Promise<BirthdayCheck>;
  claimBirthdayPromo: (eventId: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  deleteUser: (id: string) => Promise<{ ok: boolean; error?: string }>;
  promoteUser: (id: string, role: UserRole) => Promise<{ ok: boolean; error?: string }>;
  createEvent: (data: NewEventInput) => Promise<{ ok: boolean; error?: string }>;
  updateEvent: (id: string, data: Partial<NewEventInput>) => Promise<{ ok: boolean; error?: string }>;
  deleteEvent: (id: string) => Promise<{ ok: boolean; error?: string }>;
  uploadEventImage: (file: File) => Promise<{ ok: boolean; url?: string; error?: string }>;
  // ── Perfil propio ───────────────────────────────────────────────────────
  updateProfile: (data: ProfileUpdate) => Promise<{ ok: boolean; error?: string }>;
  uploadAvatar: (file: File) => Promise<{ ok: boolean; url?: string; error?: string }>;
  removeAvatar: () => Promise<{ ok: boolean; error?: string }>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  changeEmail: (newEmail: string) => Promise<{ ok: boolean; error?: string }>;
  deleteMyAccount: (password: string) => Promise<{ ok: boolean; error?: string }>;
  requestPasswordReset: (email: string) => Promise<{ ok: boolean; error?: string }>;
  updatePasswordWithSession: (newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// ─── Helpers de normalización DB ↔ App ──────────────────────────────────────
function normalizeImageTransform(p: any): ImageTransform {
  return {
    x: typeof p?.x === "number" ? p.x : 50,
    y: typeof p?.y === "number" ? p.y : 50,
    scale: typeof p?.scale === "number" ? p.scale : 1,
    fit: p?.fit === "contain" ? "contain" : "cover",
  };
}

function eventFromDb(row: any): AdminEvent {
  return {
    id: row.id,
    name: row.name,
    date: row.date,
    location: row.location,
    description: row.description ?? "",
    price: Number(row.price),
    capacity: row.capacity,
    status: row.status,
    saleEndsAt: row.sale_ends_at ?? undefined,
    image: row.image_url ?? "",
    imagePosition: normalizeImageTransform(row.image_position),
    instagramUrl: row.instagram_url ?? undefined,
    createdAt: row.created_at,
  };
}

function eventToDb(e: Partial<NewEventInput>) {
  const out: Record<string, any> = {};
  if (e.name !== undefined) out.name = e.name;
  if (e.date !== undefined) out.date = e.date;
  if (e.location !== undefined) out.location = e.location;
  if (e.description !== undefined) out.description = e.description;
  if (e.price !== undefined) out.price = e.price;
  if (e.capacity !== undefined) out.capacity = e.capacity;
  if (e.status !== undefined) out.status = e.status;
  if (e.saleEndsAt !== undefined) out.sale_ends_at = e.saleEndsAt || null;
  if (e.image !== undefined) out.image_url = e.image || null;
  if (e.imagePosition !== undefined) out.image_position = e.imagePosition;
  if (e.instagramUrl !== undefined) out.instagram_url = e.instagramUrl || null;
  return out;
}

function profileFromDb(row: any): User {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    birthDate: row.birth_date,
    documentId: row.document_id,
    email: row.email,
    role: row.role,
    avatarUrl: row.avatar_url ?? undefined,
    phone: row.phone ?? undefined,
    country: row.country ?? undefined,
    state: row.state ?? undefined,
    createdAt: row.created_at,
  };
}

// ─── Provider ───────────────────────────────────────────────────────────────
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (userId: string): Promise<User | null> => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return profileFromDb(data);
  }, []);

  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .order("date", { ascending: true });
    if (!error && data) setEvents(data.map(eventFromDb));
  }, []);

  const loadUsers = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    if (!error && data) setUsers(data.map(profileFromDb));
  }, []);

  // Init: sesión + eventos + subscripciones
  useEffect(() => {
    let mounted = true;

    // Los eventos son públicos: no dependen de la sesión, así que los pedimos
    // en paralelo en vez de esperar a getSession()/loadProfile().
    loadEvents();

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (mounted && session?.user) {
        const profile = await loadProfile(session.user.id);
        if (mounted) setCurrentUser(profile);
      }
      if (mounted) setLoading(false);
    })();

    // IMPORTANTE: la callback debe ser síncrona. Cualquier llamada async a
    // Supabase desde acá puede causar deadlock con el lock interno de auth.
    // Por eso diferimos con setTimeout(0).
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      if (!session?.user) {
        setCurrentUser(null);
        setUsers([]);
        return;
      }
      const userId = session.user.id;
      setTimeout(() => {
        if (!mounted) return;
        loadProfile(userId).then((profile) => {
          if (mounted) setCurrentUser(profile);
        });
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile, loadEvents]);

  // Cuando el currentUser es admin, traer todos los usuarios + suscribirse
  useEffect(() => {
    if (currentUser?.role !== "admin") return;
    loadUsers();
    const channel = supabase
      .channel("profiles-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        loadUsers();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUser?.role, loadUsers]);

  // Realtime de eventos para todos
  useEffect(() => {
    const channel = supabase
      .channel("events-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "events" }, (payload) => {
        setEvents((prev) => {
          const next = [...prev, eventFromDb(payload.new)];
          return next.sort((a, b) => a.date.localeCompare(b.date));
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "events" }, (payload) => {
        setEvents((prev) => prev.map((e) => (e.id === payload.new.id ? eventFromDb(payload.new) : e)));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "events" }, (payload) => {
        setEvents((prev) => prev.filter((e) => e.id !== (payload.old as any).id));
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // ─── Acciones ─────────────────────────────────────────────────────────────
  const login: AuthContextValue["login"] = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) return { ok: false, error: translateAuthError(error.message) };
    if (!data.user) return { ok: false, error: "No se pudo iniciar sesión" };
    const profile = await loadProfile(data.user.id);
    if (!profile) return { ok: false, error: "Cuenta sin perfil. Contactá al admin." };
    setCurrentUser(profile);
    return { ok: true, user: profile };
  };

  const register: AuthContextValue["register"] = async (data) => {
    const email = data.email.trim().toLowerCase();
    const documentId = data.documentId.replace(/\D/g, "");

    // 1. Verificar cédula previo al signUp (UX más limpio que esperar al trigger)
    const { data: docExists } = await supabase.rpc("document_id_exists", { doc: documentId });
    if (docExists) {
      return { ok: false, error: "Ya existe una cuenta con esa cédula" };
    }

    // 2. signUp con metadata. El trigger handle_new_user() crea el profile automáticamente.
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password: data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: {
          first_name: data.firstName,
          last_name: data.lastName,
          birth_date: data.birthDate,
          document_id: documentId,
          phone: data.phone,
          country: data.country,
          state: data.state ?? null,
        },
      },
    });

    if (signUpError) return { ok: false, error: translateAuthError(signUpError.message) };
    if (!signUpData.user) return { ok: false, error: "No se pudo crear la cuenta" };

    // 3. Si requiere confirmación de email, signUpData.session viene null
    if (!signUpData.session) {
      return { ok: true, needsEmailConfirmation: true };
    }

    const profile = await loadProfile(signUpData.user.id);
    if (profile) setCurrentUser(profile);
    return { ok: true, user: profile ?? undefined };
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    setUsers([]);
  };

  const deleteUser: AuthContextValue["deleteUser"] = async (id) => {
    if (id === currentUser?.id) return { ok: false, error: "No podés eliminar tu propia cuenta" };
    const { error } = await supabase.from("profiles").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const promoteUser: AuthContextValue["promoteUser"] = async (id, role) => {
    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);
    if (error) return { ok: false, error: error.message };
    if (currentUser?.id === id) setCurrentUser({ ...currentUser, role });
    return { ok: true };
  };

  const createEvent: AuthContextValue["createEvent"] = async (data) => {
    const { error } = await supabase.from("events").insert(eventToDb(data));
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const updateEvent: AuthContextValue["updateEvent"] = async (id, data) => {
    const { error } = await supabase.from("events").update(eventToDb(data)).eq("id", id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const deleteEvent: AuthContextValue["deleteEvent"] = async (id) => {
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  const uploadEventImage: AuthContextValue["uploadEventImage"] = async (file) => {
    try {
      // Las tarjetas se muestran a 280-320px; 800px cubre pantallas retina (2x)
      // sin servir imágenes innecesariamente pesadas en el plan free.
      const blob = await compressImageToBlob(file, 800, 0.8);
      const ext = "jpg";
      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from(EVENT_IMAGES_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) return { ok: false, error: error.message };
      const { data } = supabase.storage.from(EVENT_IMAGES_BUCKET).getPublicUrl(path);
      return { ok: true, url: data.publicUrl };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  };

  // ── Perfil propio ─────────────────────────────────────────────────────────
  const refreshProfile = async () => {
    if (!currentUser) return;
    const profile = await loadProfile(currentUser.id);
    if (profile) setCurrentUser(profile);
  };

  const updateProfile: AuthContextValue["updateProfile"] = async (data) => {
    if (!currentUser) return { ok: false, error: "No autenticado" };
    const row: Record<string, any> = {};
    if (data.firstName !== undefined) row.first_name = data.firstName;
    if (data.lastName !== undefined) row.last_name = data.lastName;
    if (data.birthDate !== undefined) row.birth_date = data.birthDate;
    if (data.avatarUrl !== undefined) row.avatar_url = data.avatarUrl;
    if (data.phone !== undefined) row.phone = data.phone;
    if (data.country !== undefined) row.country = data.country;
    if (data.state !== undefined) row.state = data.state;
    if (Object.keys(row).length === 0) return { ok: true };

    const { error } = await supabase.from("profiles").update(row).eq("id", currentUser.id);
    if (error) return { ok: false, error: error.message };
    await refreshProfile();
    return { ok: true };
  };

  const uploadAvatar: AuthContextValue["uploadAvatar"] = async (file) => {
    if (!currentUser) return { ok: false, error: "No autenticado" };
    try {
      const blob = await compressImageToBlob(file, 512, 0.9);
      // Archivo dentro de la carpeta del user → RLS habilita escritura
      const path = `${currentUser.id}/avatar-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from(AVATARS_BUCKET)
        .upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (uploadError) return { ok: false, error: uploadError.message };
      const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(path);
      // cache-buster por si reescriben el mismo path
      const url = `${data.publicUrl}?v=${Date.now()}`;
      const upd = await updateProfile({ avatarUrl: url });
      if (!upd.ok) return { ok: false, error: upd.error };
      return { ok: true, url };
    } catch (err) {
      return { ok: false, error: (err as Error).message };
    }
  };

  const removeAvatar: AuthContextValue["removeAvatar"] = async () => {
    if (!currentUser?.avatarUrl) return { ok: true };
    // borramos el archivo de Storage (best-effort)
    try {
      const match = currentUser.avatarUrl.match(/avatars\/(.+?)(\?|$)/);
      if (match) {
        await supabase.storage.from(AVATARS_BUCKET).remove([match[1]]);
      }
    } catch {
      /* ignoramos errores de borrado del file físico */
    }
    return updateProfile({ avatarUrl: null });
  };

  const changePassword: AuthContextValue["changePassword"] = async (currentPassword, newPassword) => {
    if (!currentUser) return { ok: false, error: "No autenticado" };
    // Re-auth con la contraseña actual para validar
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: currentPassword,
    });
    if (reauthError) return { ok: false, error: "Contraseña actual incorrecta" };
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: translateAuthError(error.message) };
    return { ok: true };
  };

  const changeEmail: AuthContextValue["changeEmail"] = async (newEmail) => {
    const email = newEmail.trim().toLowerCase();
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: `${window.location.origin}/login` }
    );
    if (error) return { ok: false, error: translateAuthError(error.message) };
    return { ok: true };
  };

  const deleteMyAccount: AuthContextValue["deleteMyAccount"] = async (password) => {
    if (!currentUser) return { ok: false, error: "No autenticado" };
    // Verificar contraseña antes
    const { error: reauthError } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password,
    });
    if (reauthError) return { ok: false, error: "Contraseña incorrecta" };

    const { error } = await supabase.rpc("delete_my_account");
    if (error) return { ok: false, error: error.message };
    await supabase.auth.signOut();
    setCurrentUser(null);
    return { ok: true };
  };

  const requestPasswordReset: AuthContextValue["requestPasswordReset"] = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) return { ok: false, error: translateAuthError(error.message) };
    return { ok: true };
  };

  const updatePasswordWithSession: AuthContextValue["updatePasswordWithSession"] = async (newPassword) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { ok: false, error: translateAuthError(error.message) };
    return { ok: true };
  };

  // ── Promo cumpleaños ──────────────────────────────────────────────────────
  const checkBirthdayPromo: AuthContextValue["checkBirthdayPromo"] = async (eventId) => {
    if (!currentUser) return { canClaim: false, reason: "no_auth" };
    const { data, error } = await supabase.rpc("can_claim_birthday_promo", {
      target_event: eventId,
    });
    if (error || !data || !data[0]) return { canClaim: false, reason: "no_auth" };
    const row = data[0];
    return {
      canClaim: row.can_claim,
      reason: row.reason,
      nextAvailable: row.next_available ?? undefined,
    };
  };

  const claimBirthdayPromo: AuthContextValue["claimBirthdayPromo"] = async (eventId) => {
    if (!currentUser) return { ok: false, error: "No autenticado" };
    const check = await checkBirthdayPromo(eventId);
    if (!check.canClaim) {
      const msg: Record<string, string> = {
        no_auth: "Iniciá sesión para reclamar el beneficio",
        no_birth_date: "Falta tu fecha de nacimiento en el perfil",
        no_event: "Evento inválido",
        birthday_too_far: "Tu cumple no cae cerca de la fecha del evento",
        cooldown: check.nextAvailable
          ? `Ya reclamaste una promo recientemente. Próximo disponible: ${check.nextAvailable}`
          : "Ya reclamaste una promo recientemente",
        already_claimed: "Ya reclamaste la promo para este evento",
      };
      return { ok: false, error: msg[check.reason] ?? "No podés reclamar la promo" };
    }
    const { error } = await supabase
      .from("birthday_promo_claims")
      .insert({ user_id: currentUser.id, event_id: eventId });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        users,
        events,
        loading,
        login,
        register,
        logout,
        deleteUser,
        promoteUser,
        createEvent,
        updateEvent,
        deleteEvent,
        uploadEventImage,
        updateProfile,
        uploadAvatar,
        removeAvatar,
        changePassword,
        changeEmail,
        deleteMyAccount,
        requestPasswordReset,
        updatePasswordWithSession,
        refreshProfile,
        checkBirthdayPromo,
        claimBirthdayPromo,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
};

// ─── Helpers públicos ───────────────────────────────────────────────────────
export const validateDocumentId = (doc: string) => {
  const clean = doc.replace(/[^\d]/g, "");
  return clean.length >= 7 && clean.length <= 8;
};

const MONTHS_ES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

export const formatEventDate = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS_ES[m - 1]} ${y}`;
};

export const compressImageToBlob = (
  file: File,
  maxWidth = 1200,
  quality = 0.85
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const ratio = Math.min(1, maxWidth / img.width);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("No se pudo procesar la imagen"));
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo crear la imagen"))),
          "image/jpeg",
          quality
        );
      };
      img.onerror = () => reject(new Error("Imagen inválida"));
      img.src = ev.target?.result as string;
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });

// Traducción de mensajes comunes de Supabase Auth
function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Email o contraseña incorrectos";
  if (m.includes("user already registered")) return "Ya existe una cuenta con ese email";
  if (m.includes("email not confirmed")) return "Confirmá tu email antes de ingresar";
  if (m.includes("password should be at least")) return "La contraseña es muy corta";
  if (m.includes("rate limit")) return "Demasiados intentos, esperá un momento";
  return msg;
}
