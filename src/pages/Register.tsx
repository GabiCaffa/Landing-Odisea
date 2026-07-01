import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Mail } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PhoneInput from "@/components/PhoneInput";
import LocationSelect from "@/components/LocationSelect";
import { useAuth } from "@/contexts/AuthContext";
import {
  validateDocumentByCountry,
  documentLabelByCountry,
  documentPlaceholderByCountry,
  normalizePhone,
  calcAge,
} from "@/lib/validators";
import { DEFAULT_COUNTRY_CODE } from "@/lib/locations";
import { CountryCode } from "libphonenumber-js";
import { toast } from "sonner";

const Register = () => {
  const navigate = useNavigate();
  const { register, resendConfirmation } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);
  const [acceptedTerms, setAcceptedTerms] = useState(false);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    birthDate: "",
    documentId: "",
    country: DEFAULT_COUNTRY_CODE,
    state: "",
    phone: "",
    email: "",
    confirmEmail: "",
    password: "",
    confirmPassword: "",
  });

  const update =
    (field: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleResend = async () => {
    if (!confirmationEmail || resending) return;
    setResending(true);
    const result = await resendConfirmation(confirmationEmail);
    setResending(false);
    if (result.ok) toast.success("Te reenviamos el correo de confirmación");
    else toast.error(result.error ?? "No se pudo reenviar el correo");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    if (!form.firstName.trim() || !form.lastName.trim()) {
      toast.error("Completá nombre y apellido");
      setSubmitting(false);
      return;
    }
    if (!form.birthDate) {
      toast.error("Ingresá tu fecha de nacimiento");
      setSubmitting(false);
      return;
    }
    if (calcAge(form.birthDate) < 18) {
      toast.error("Debés ser mayor de 18 años para registrarte");
      setSubmitting(false);
      return;
    }
    if (!validateDocumentByCountry(form.documentId, form.country)) {
      toast.error(`Documento inválido para ${form.country}`);
      setSubmitting(false);
      return;
    }
    if (!form.country) {
      toast.error("Seleccioná un país");
      setSubmitting(false);
      return;
    }
    if (!form.state.trim()) {
      toast.error("Indicá tu departamento o provincia");
      setSubmitting(false);
      return;
    }
    const phoneE164 = normalizePhone(form.phone, form.country as CountryCode);
    if (!phoneE164) {
      toast.error("Número de teléfono inválido para ese país");
      setSubmitting(false);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error("Email inválido");
      setSubmitting(false);
      return;
    }
    if (form.email.trim().toLowerCase() !== form.confirmEmail.trim().toLowerCase()) {
      toast.error("Los emails no coinciden. Revisá que estén bien escritos.");
      setSubmitting(false);
      return;
    }
    if (form.password.length < 6) {
      toast.error("La contraseña debe tener al menos 6 caracteres");
      setSubmitting(false);
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      setSubmitting(false);
      return;
    }
    if (!acceptedTerms) {
      toast.error("Tenés que aceptar los Términos de Uso y la Política de Privacidad");
      setSubmitting(false);
      return;
    }

    const result = await register({
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      birthDate: form.birthDate,
      documentId: form.documentId.replace(/\D/g, ""),
      email: form.email,
      password: form.password,
      phone: phoneE164,
      country: form.country,
      state: form.state.trim(),
    });

    if (!result.ok) {
      toast.error(result.error ?? "No se pudo crear la cuenta");
      setSubmitting(false);
      return;
    }

    if (result.needsEmailConfirmation) {
      setConfirmationEmail(form.email);
      setSubmitting(false);
      return;
    }

    toast.success("¡Bienvenido a ODÍSEA!");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 pt-24 md:pt-32 pb-16">
        <div className="container-odisea max-w-2xl">
          <div className="text-center mb-8 md:mb-10">
            <p className="eyebrow mb-4">Sumate a la comunidad</p>
            <h1 className="title-sport text-5xl md:text-6xl mb-4 text-tinta">
              CREAR <span className="highlight-celeste">CUENTA</span>
            </h1>
            <div className="w-16 h-px bg-celeste mx-auto" />
          </div>

          {confirmationEmail ? (
            <div className="border border-border p-6 md:p-8 bg-card text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-foreground text-background flex items-center justify-center mx-auto">
                <Mail className="w-6 h-6" />
              </div>
              <h2 className="font-display text-2xl tracking-wide">REVISÁ TU EMAIL</h2>
              <p className="text-sm text-muted-foreground">
                Te enviamos un link de confirmación a{" "}
                <span className="font-mono">{confirmationEmail}</span>. Hacé click para activar tu
                cuenta y después iniciá sesión.
              </p>
              <Link to="/login" className="btn-techno-outline inline-block">
                Ir al login
              </Link>
              <p className="text-sm text-muted-foreground">
                ¿No te llegó?{" "}
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="text-foreground font-semibold hover:underline disabled:opacity-60"
                >
                  {resending ? "Reenviando..." : "Reenviar correo"}
                </button>
              </p>
            </div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="space-y-6 rounded-2xl border border-border p-6 md:p-8 bg-card shadow-[var(--shadow-md)]"
            >
              {/* ─── Datos personales ─── */}
              <FormSection title="Datos personales">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Nombre">
                    <input
                      type="text"
                      required
                      value={form.firstName}
                      onChange={update("firstName")}
                      className="input-techno"
                      placeholder="Juan"
                      autoComplete="given-name"
                    />
                  </Field>
                  <Field label="Apellido">
                    <input
                      type="text"
                      required
                      value={form.lastName}
                      onChange={update("lastName")}
                      className="input-techno"
                      placeholder="Pérez"
                      autoComplete="family-name"
                    />
                  </Field>
                </div>

                <Field label="Fecha de nacimiento">
                  <input
                    type="date"
                    required
                    value={form.birthDate}
                    onChange={update("birthDate")}
                    max={new Date().toISOString().split("T")[0]}
                    className="input-techno"
                  />
                </Field>
              </FormSection>

              {/* ─── Ubicación ─── */}
              <FormSection title="Ubicación">
                <LocationSelect
                  country={form.country}
                  state={form.state}
                  onCountryChange={(c) => setForm((p) => ({ ...p, country: c, state: "" }))}
                  onStateChange={(s) => setForm((p) => ({ ...p, state: s }))}
                  required
                />
              </FormSection>

              {/* ─── Documento + teléfono (varía según país) ─── */}
              <FormSection title="Identificación y contacto">
                <Field label={documentLabelByCountry(form.country)}>
                  <input
                    type="text"
                    required
                    inputMode="numeric"
                    value={form.documentId}
                    onChange={update("documentId")}
                    className="input-techno"
                    placeholder={documentPlaceholderByCountry(form.country)}
                    maxLength={20}
                  />
                </Field>

                <div>
                  <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
                    Teléfono
                  </span>
                  <PhoneInput
                    country={form.country}
                    value={form.phone}
                    onCountryChange={(c) => setForm((p) => ({ ...p, country: c, state: "" }))}
                    onChange={(v) => setForm((p) => ({ ...p, phone: v }))}
                    required
                  />
                </div>
              </FormSection>

              {/* ─── Acceso ─── */}
              <FormSection title="Acceso a la cuenta">
                <Field label="Email">
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={update("email")}
                    className="input-techno"
                    placeholder="tu@email.com"
                    autoComplete="email"
                  />
                </Field>

                <Field label="Confirmar email">
                  <input
                    type="email"
                    required
                    value={form.confirmEmail}
                    onChange={update("confirmEmail")}
                    onPaste={(e) => e.preventDefault()}
                    className="input-techno"
                    placeholder="Repetí tu email"
                    autoComplete="off"
                  />
                  {form.confirmEmail &&
                    form.email.trim().toLowerCase() !== form.confirmEmail.trim().toLowerCase() && (
                      <span className="mt-1 block text-xs text-charrua">Los emails no coinciden</span>
                    )}
                </Field>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Contraseña">
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={form.password}
                        onChange={update("password")}
                        className="input-techno pr-10"
                        placeholder="Mínimo 6 caracteres"
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                        aria-label={showPassword ? "Ocultar" : "Mostrar"}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </Field>
                  <Field label="Confirmar contraseña">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={form.confirmPassword}
                      onChange={update("confirmPassword")}
                      className="input-techno"
                      placeholder="Repetí la contraseña"
                      autoComplete="new-password"
                    />
                  </Field>
                </div>
              </FormSection>

              {/* ─── Consentimiento (Ley 18.331) ─── */}
              <label className="flex items-start gap-3 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-celeste cursor-pointer"
                />
                <span>
                  He leído y acepto los{" "}
                  <Link
                    to="/terminos"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground font-semibold hover:underline"
                  >
                    Términos de Uso
                  </Link>{" "}
                  y la{" "}
                  <Link
                    to="/privacidad"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground font-semibold hover:underline"
                  >
                    Política de Privacidad
                  </Link>
                  , y autorizo el tratamiento de mis datos personales.
                </span>
              </label>

              <button
                type="submit"
                disabled={submitting || !acceptedTerms}
                className="btn-techno w-full disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {submitting ? "Creando cuenta..." : "Crear cuenta"}
              </button>

              <p className="text-center text-sm text-muted-foreground">
                ¿Ya tenés cuenta?{" "}
                <Link to="/login" className="text-foreground font-semibold hover:underline">
                  Iniciá sesión
                </Link>
              </p>
            </form>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

const FormSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="space-y-4">
    <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground border-b border-border pb-2">
      {title}
    </p>
    {children}
  </div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="block">
    <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
      {label}
    </span>
    {children}
  </label>
);

export default Register;
