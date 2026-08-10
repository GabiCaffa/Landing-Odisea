import { useEffect, useMemo, useState } from "react";
import { X, Cake, Check, Copy, AlertTriangle, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import whatsappLogo from "@/assets/whatsapp-logo.png";
import PhoneInput from "./PhoneInput";
import AuthPromptStep from "./AuthPromptStep";
import { useAuth, formatEventDate } from "@/contexts/AuthContext";
import { normalizePhone, formatPhoneDisplay } from "@/lib/validators";
import { DEFAULT_COUNTRY_CODE } from "@/lib/locations";
import { CountryCode } from "libphonenumber-js";
import { toast } from "sonner";

/** Días de tolerancia entre el cumple y la fecha del evento (igual que la DB). */
export const BIRTHDAY_WINDOW_DAYS = 15;

const MS_PER_DAY = 86_400_000;

/**
 * Días entre el cumpleaños y la fecha del evento, tomando el aniversario más
 * cercano. Se prueban los años vecinos para que un cumple del 28/12 y un evento
 * del 05/01 den 8 días y no 357.
 */
export function daysBirthdayToEvent(birthDate: string, eventDate: string): number | null {
  const [by, bm, bd] = birthDate.split("-").map(Number);
  const [ey, em, ed] = eventDate.split("-").map(Number);
  if (!by || !bm || !bd || !ey || !em || !ed) return null;
  const event = Date.UTC(ey, em - 1, ed);
  return Math.min(
    ...[ey - 1, ey, ey + 1].map((year) =>
      Math.round(Math.abs(event - Date.UTC(year, bm - 1, bd)) / MS_PER_DAY)
    )
  );
}

/** "2008-08-13" → "13/08/2008" */
const formatBirthDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

interface BirthdayPromoModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Step = "auth-prompt" | "form";

const BirthdayPromoModal = ({ isOpen, onClose }: BirthdayPromoModalProps) => {
  const { currentUser, events } = useAuth();

  const [step, setStep] = useState<Step>("auth-prompt");
  const [country, setCountry] = useState(currentUser?.country ?? DEFAULT_COUNTRY_CODE);
  const [form, setForm] = useState({
    name: "",
    birthDate: "",
    email: "",
    phone: "",
    eventId: "",
  });

  // Con sesión saltamos el prompt: los datos ya están, no hay nada que pedir.
  useEffect(() => {
    if (!isOpen) return;
    if (currentUser) {
      setStep("form");
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
    } else {
      setStep("auth-prompt");
    }
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

  if (!isOpen) return null;

  const phoneE164 = form.phone.trim()
    ? normalizePhone(form.phone, country as CountryCode)
    : null;

  const isFormValid =
    !!form.name.trim() && !!form.birthDate && !!form.email.trim() && !!phoneE164;

  const buildMessage = () => {
    const firstName = form.name.trim().split(" ")[0];
    let msg = `Buenas! Soy ${firstName} 🎂\n`;
    msg += `Quiero acceder a la PROMO CUMPLEAÑOS.\n\n`;
    msg += `Mis datos:\n`;
    msg += `Nombre completo: ${form.name.trim()}\n`;
    msg += `Fecha de nacimiento: ${formatBirthDate(form.birthDate)}\n`;
    msg += `Email: ${form.email.trim()}\n`;
    if (phoneE164) msg += `Teléfono: ${formatPhoneDisplay(phoneE164)}\n`;
    if (currentUser?.documentId) msg += `Documento: ${currentUser.documentId}\n`;
    msg += `\n`;
    msg += chosen
      ? `Evento al que voy: ${chosen.name} (${formatEventDate(chosen.date)})\n`
      : `Evento al que voy: todavía no lo elegí\n`;
    msg += `\nTe paso ahora la foto del frente de mi cédula 📎`;
    return msg;
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error("Indicá tu nombre completo");
    if (!form.birthDate) return toast.error("Indicá tu fecha de nacimiento");
    if (!form.email.trim()) return toast.error("Indicá tu email");
    if (!phoneE164) return toast.error("Teléfono inválido");

    const url = `https://wa.me/59892592179?text=${encodeURIComponent(buildMessage())}`;
    window.open(url, "_blank");
    onClose();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildMessage());
      toast.success("Mensaje copiado");
    } catch {
      toast.error("No se pudo copiar. Mandalo por WhatsApp.");
    }
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

        {step === "auth-prompt" ? (
          <AuthPromptStep
            subtitle="Con cuenta no tenés que cargar nada: usamos los datos de tu perfil y verificamos solo si tu cumple califica."
            loginHint="Tus datos y tu fecha de nacimiento se completan solos"
            registerHint="La próxima vez reclamás el beneficio en un clic"
            guestHint="Cargás tus datos a mano esta vez"
            onContinue={() => setStep("form")}
          />
        ) : (
          <div className="p-4 md:p-6 space-y-6">
            {currentUser ? (
              <div className="flex items-center gap-3 p-3 bg-secondary/40 border border-border">
                <Check className="w-4 h-4 flex-shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Conectado como{" "}
                  <span className="font-semibold text-foreground">{currentUser.firstName}</span>.
                  Tus datos ya están cargados.
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-3 p-3 border border-dashed border-border">
                <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Estás como invitado.{" "}
                  <Link
                    to={`/registro?next=${encodeURIComponent(window.location.pathname)}`}
                    className="font-semibold text-foreground underline"
                  >
                    Creá tu cuenta
                  </Link>{" "}
                  y la próxima vez no cargás nada de esto de nuevo.
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
                Opcional. Si todavía no sabés, dejalo sin elegir y lo coordinamos por WhatsApp.
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
                          para ±{BIRTHDAY_WINDOW_DAYS}. Podés mandar el mensaje igual y lo
                          vemos, pero puede que no aplique.
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
                      {BIRTHDAY_WINDOW_DAYS} días de tu cumple. Igual podés escribirnos.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Qué falta */}
            <div className="p-4 bg-secondary/30 border border-border space-y-2">
              <h4 className="font-medium text-base">Un último paso</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                📎 Para validar tu identidad necesitamos la{" "}
                <strong>foto del frente de tu cédula</strong>. El mensaje ya avisa que la vas a
                mandar: adjuntala en el mismo chat de WhatsApp.
              </p>
            </div>

            {/* Acciones */}
            <div className="space-y-3">
              <button
                onClick={handleSubmit}
                disabled={!isFormValid}
                className="btn-techno w-full disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <img src={whatsappLogo} alt="WhatsApp" className="w-5 h-5" />
                <span>Enviar por WhatsApp</span>
              </button>

              {isFormValid && (
                <button
                  onClick={handleCopy}
                  className="w-full inline-flex items-center justify-center gap-2 border border-border px-4 py-2.5 text-xs tracking-wider uppercase hover:bg-foreground hover:text-background transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copiar el mensaje
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BirthdayPromoModal;
