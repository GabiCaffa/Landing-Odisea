import { useEffect, useMemo, useRef, useState } from "react";
import { X, Cake, Check, AlertTriangle, Upload, Clock, Send } from "lucide-react";
import { Link } from "react-router-dom";
import PhoneInput from "./PhoneInput";
import AuthPromptStep from "./AuthPromptStep";
import { useAuth, formatEventDate } from "@/contexts/AuthContext";
import {
  BirthdaySignup,
  createBirthdayRequest,
  fetchMyBirthdayRequests,
  uploadIdPhoto,
  removeIdPhoto,
} from "@/lib/birthdays";
import {
  normalizePhone,
  formatPhoneDisplay,
  usableDocumentId,
  daysBirthdayToEvent,
  BIRTHDAY_WINDOW_DAYS,
} from "@/lib/validators";
import { DEFAULT_COUNTRY_CODE } from "@/lib/locations";
import { CountryCode } from "libphonenumber-js";
import { toast } from "sonner";

interface BirthdayPromoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Reclamo de la promo de cumpleaños desde el sitio. **Requiere cuenta**: la
 * solicitud se carga en `birthday_signups` como pendiente a nombre del usuario,
 * con la foto del documento en el bucket privado. Sin sesión no hay dueño de la
 * fila ni de la foto, así que no se ofrece ninguna vía alternativa (antes se
 * armaba un mensaje de WhatsApp). El staff sigue pudiendo cargar a mano desde la
 * pestaña Cumpleaños del panel.
 */
const BirthdayPromoModal = ({ isOpen, onClose }: BirthdayPromoModalProps) => {
  const { currentUser, events } = useAuth();

  const [country, setCountry] = useState(currentUser?.country ?? DEFAULT_COUNTRY_CODE);
  const [form, setForm] = useState({
    name: "",
    birthDate: "",
    email: "",
    phone: "",
    eventId: "",
  });

  // La foto se guarda en memoria y se sube recién al enviar: si cierra el modal
  // sin enviar no queda un archivo huérfano en el bucket (el cliente no tiene
  // permiso para borrar, así que limpiarlo después sería trabajo del staff).
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [myRequests, setMyRequests] = useState<BirthdaySignup[]>([]);

  // Datos del perfil como punto de partida (quedan editables).
  useEffect(() => {
    if (!isOpen || !currentUser) return;
    setCountry(currentUser.country ?? DEFAULT_COUNTRY_CODE);
    setForm((p) => ({
      ...p,
      name: `${currentUser.firstName} ${currentUser.lastName}`,
      birthDate: currentUser.birthDate ?? "",
      email: currentUser.email,
      phone: currentUser.phone
        ? formatPhoneDisplay(currentUser.phone).replace(/^\+\d+\s*/, "")
        : "",
    }));
  }, [isOpen, currentUser]);

  // Eventos a los que puede ir, con los días que separan su cumple de la fecha.
  const eventOptions = useMemo(() => {
    const upcoming = events
      .filter((e) => e.status !== "finalizado")
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date));
    return upcoming.map((e) => {
      const days = form.birthDate ? daysBirthdayToEvent(form.birthDate, e.date) : null;
      return {
        id: e.id,
        name: e.name,
        date: e.date,
        days,
        eligible: days !== null && days <= BIRTHDAY_WINDOW_DAYS,
      };
    });
  }, [events, form.birthDate]);

  const eligibleEvents = eventOptions.filter((e) => e.eligible);
  const chosen = eventOptions.find((e) => e.id === form.eventId);

  // Si hay un solo evento que califica, se propone solo: no lo hacemos buscar.
  const soleEligibleId = eligibleEvents.length === 1 ? eligibleEvents[0].id : null;
  useEffect(() => {
    if (!soleEligibleId) return;
    setForm((p) => (p.eventId ? p : { ...p, eventId: soleEligibleId }));
  }, [soleEligibleId]);

  // Solicitudes que ya mandó, para no ofrecerle cargar una repetida.
  useEffect(() => {
    if (!isOpen || !currentUser) {
      setMyRequests([]);
      return;
    }
    let active = true;
    fetchMyBirthdayRequests().then((rows) => {
      if (active) setMyRequests(rows);
    });
    return () => {
      active = false;
    };
  }, [isOpen, currentUser]);

  useEffect(() => {
    if (!isOpen) setPhotoFile(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const phoneE164 = form.phone.trim()
    ? normalizePhone(form.phone, country as CountryCode)
    : null;

  const isFormValid =
    !!form.name.trim() && !!form.birthDate && !!form.email.trim() && !!phoneE164;

  // El documento sale del perfil (no se pide de nuevo). Si falta, no hay con qué
  // contrastar la foto: se avisa antes de que cargue nada, no al enviar.
  const profileDocument = usableDocumentId(currentUser?.documentId);

  // Los índices únicos de v16 son por (usuario, evento): una pendiente para el
  // evento A no bloquea pedir el beneficio para el B.
  const pendingRequests = myRequests.filter((r) => r.status === "pendiente");
  const pendingForChoice = pendingRequests.find((r) => (r.eventId ?? "") === form.eventId);

  const pickPhoto = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Tiene que ser una imagen");
    if (file.size > 10 * 1024 * 1024) return toast.error("La imagen es muy grande (máx 10MB)");
    setPhotoFile(file);
  };

  /** Carga la solicitud como pendiente para que el staff la revise. */
  const handleSendRequest = async () => {
    if (!currentUser) return;
    if (!profileDocument) {
      return toast.error(
        "Falta tu número de documento en el perfil. Completalo y volvé a intentar."
      );
    }
    if (!form.name.trim()) return toast.error("Indicá tu nombre completo");
    if (!form.birthDate) return toast.error("Indicá tu fecha de nacimiento");
    if (!form.email.trim()) return toast.error("Indicá tu email");
    if (!phoneE164) return toast.error("Teléfono inválido");
    if (!photoFile) return toast.error("Adjuntá la foto del frente de tu documento");

    setSending(true);

    const upload = await uploadIdPhoto(photoFile);
    if (!upload.ok || !upload.path) {
      setSending(false);
      return toast.error(upload.error ?? "No se pudo subir la foto");
    }

    const [firstName, ...rest] = form.name.trim().split(" ");
    const result = await createBirthdayRequest({
      eventId: form.eventId || null,
      firstName,
      lastName: rest.join(" ") || firstName,
      documentId: profileDocument,
      birthDate: form.birthDate,
      email: form.email.trim() || null,
      phone: phoneE164,
      country: currentUser.country ?? null,
      state: currentUser.state ?? null,
      idPhotoPath: upload.path,
      notes: "Solicitud cargada por el cliente desde la web",
    });
    setSending(false);

    if (!result.ok) {
      // La foto ya se subió: intentamos limpiarla para no dejarla colgada.
      await removeIdPhoto(upload.path);
      return toast.error(result.error ?? "No se pudo enviar la solicitud");
    }

    toast.success("Solicitud enviada. Te la confirmamos por WhatsApp o email.");
    setPhotoFile(null);
    setMyRequests(await fetchMyBirthdayRequests());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="relative w-full max-w-2xl h-full sm:h-auto sm:max-h-[92vh] overflow-y-auto bg-background border border-border"
        style={{ fontFamily: "Inter, sans-serif", letterSpacing: "normal" }}
      >
        {/* Header */}
        <div className="sticky top-0 bg-background border-b border-border p-4 md:p-6 flex items-center justify-between z-10">
          <div className="flex items-center gap-3 min-w-0">
            <Cake className="w-6 h-6 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="text-xl md:text-2xl font-semibold">Promo cumpleaños</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Si tu cumple cae cerca del evento, tenés beneficio
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted transition-colors flex-shrink-0"
            aria-label="Cerrar"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {!currentUser ? (
          <AuthPromptStep
            title="Necesitás una cuenta"
            subtitle="El beneficio se reclama desde tu cuenta: así la solicitud queda a tu nombre y la foto de tu documento viaja en privado, sin pasar por un chat."
            loginHint="Tus datos y tu fecha de nacimiento se completan solos"
            registerHint="Te lleva un minuto y después reclamás el beneficio en un clic"
          />
        ) : (
          <div className="p-4 md:p-6 space-y-6">
            <div className="flex items-center gap-3 p-3 bg-secondary/40 border border-border">
              <Check className="w-4 h-4 flex-shrink-0" />
              <p className="text-xs text-muted-foreground">
                Conectado como{" "}
                <span className="font-semibold text-foreground">{currentUser.firstName}</span>.
                Tus datos ya están cargados.
              </p>
            </div>

            {!profileDocument && (
              <div className="flex items-start gap-3 p-3 border border-charrua">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-charrua" />
                <p className="text-xs">
                  <span className="font-semibold">Falta tu número de documento.</span> Lo
                  necesitamos para validar la foto.{" "}
                  <Link to="/perfil" className="font-semibold underline">
                    Completalo en tu perfil
                  </Link>{" "}
                  y volvé a intentar.
                </p>
              </div>
            )}

            {/* Datos */}
            <div>
              <h3 className="text-lg font-medium mb-4">Tus datos</h3>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Nombre completo *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full p-3 border border-border bg-background focus:outline-none focus:border-foreground transition-colors"
                    placeholder="Como figura en tu documento"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Fecha de nacimiento *
                  </label>
                  <input
                    type="date"
                    value={form.birthDate}
                    onChange={(e) => setForm({ ...form, birthDate: e.target.value })}
                    max={new Date().toISOString().slice(0, 10)}
                    min="1900-01-01"
                    className="w-full p-3 border border-border bg-background focus:outline-none focus:border-foreground transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Email *</label>
                  <input
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full p-3 border border-border bg-background focus:outline-none focus:border-foreground transition-colors"
                    placeholder="tu@email.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Teléfono *</label>
                  <PhoneInput
                    country={country}
                    value={form.phone}
                    onCountryChange={setCountry}
                    onChange={(v) => setForm({ ...form, phone: v })}
                    autoComplete="tel"
                  />
                </div>
              </div>
            </div>

            {/* Evento */}
            <div>
              <h3 className="text-lg font-medium mb-2">¿A qué evento vas?</h3>
              <p className="text-xs text-muted-foreground mb-3">
                Opcional. Si todavía no sabés, dejalo sin elegir y lo coordinamos cuando te
                confirmemos el beneficio.
              </p>
              <select
                value={form.eventId}
                onChange={(e) => setForm({ ...form, eventId: e.target.value })}
                className="w-full p-3 border border-border bg-background focus:outline-none focus:border-foreground transition-colors"
              >
                <option value="">Todavía no lo elegí</option>
                {eventOptions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {formatEventDate(e.date)} · {e.name}
                    {e.eligible ? " ✓ tu cumple califica" : ""}
                  </option>
                ))}
              </select>

              {form.birthDate && (
                <div className="mt-3 text-xs">
                  {chosen ? (
                    chosen.eligible ? (
                      <p className="flex items-start gap-2 text-muted-foreground">
                        <Check className="w-4 h-4 flex-shrink-0 mt-px" />
                        <span>
                          Tu cumple cae a {chosen.days}{" "}
                          {chosen.days === 1 ? "día" : "días"} de este evento: entra en la
                          ventana del beneficio.
                        </span>
                      </p>
                    ) : (
                      <p className="flex items-start gap-2 text-charrua font-medium">
                        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-px" />
                        <span>
                          Tu cumple cae a {chosen.days} días de este evento y el beneficio es
                          para ±{BIRTHDAY_WINDOW_DAYS}. Podés enviar la solicitud igual y la
                          revisamos, pero puede que no aplique.
                        </span>
                      </p>
                    )
                  ) : eligibleEvents.length > 0 ? (
                    <p className="text-muted-foreground">
                      Por tu fecha de nacimiento, califica{" "}
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, eventId: eligibleEvents[0].id })}
                        className="font-semibold text-foreground underline"
                      >
                        {eligibleEvents[0].name}
                      </button>{" "}
                      ({formatEventDate(eligibleEvents[0].date)}).
                    </p>
                  ) : (
                    <p className="text-muted-foreground">
                      Ninguno de los eventos publicados cae dentro de los ±
                      {BIRTHDAY_WINDOW_DAYS} días de tu cumple. Igual podés enviar la
                      solicitud y la revisamos.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Foto del documento */}
            <div className="space-y-3">
              <div>
                <h3 className="text-lg font-medium">Foto del documento</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  El frente de tu cédula, para validar que sos vos. Se guarda en privado y la
                  ve sólo el equipo de ODÍSEA.
                </p>
              </div>

              <div
                onDrop={(e) => {
                  e.preventDefault();
                  pickPhoto(e.dataTransfer.files?.[0]);
                }}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-border p-4"
              >
                {photoFile ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={URL.createObjectURL(photoFile)}
                      alt="Documento"
                      className="w-20 h-14 object-cover border border-border flex-shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium truncate">{photoFile.name}</p>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-[11px] text-muted-foreground underline"
                      >
                        Cambiar la foto
                      </button>
                    </div>
                    <Check className="w-4 h-4 flex-shrink-0" />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-6 flex flex-col items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Upload className="w-6 h-6" />
                    <span className="text-sm">Subir la foto del frente</span>
                    <span className="text-xs">o arrastrala acá</span>
                  </button>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={(e) => pickPhoto(e.target.files?.[0])}
                  className="hidden"
                />
              </div>
            </div>

            {/* Solicitudes ya enviadas */}
            {pendingForChoice ? (
              <div className="flex items-start gap-3 p-3 border border-foreground bg-secondary/40">
                <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p className="text-xs">
                  <span className="font-semibold">Ya tenés una solicitud en revisión</span>
                  {pendingForChoice.eventId
                    ? ` para ${
                        eventOptions.find((e) => e.id === pendingForChoice.eventId)?.name ??
                        "un evento"
                      }`
                    : " sin evento elegido"}
                  . Te confirmamos en breve; si necesitás cambiarla, escribinos por WhatsApp.
                </p>
              </div>
            ) : (
              pendingRequests.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Tenés {pendingRequests.length}{" "}
                  {pendingRequests.length === 1 ? "solicitud" : "solicitudes"} en revisión para
                  otras fechas.
                </p>
              )
            )}

            {/* Acción */}
            <button
              onClick={handleSendRequest}
              disabled={
                !isFormValid || !photoFile || !profileDocument || !!pendingForChoice || sending
              }
              className="btn-techno w-full disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-4 h-4" />
              <span>{sending ? "Enviando..." : "Enviar mi solicitud"}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BirthdayPromoModal;
