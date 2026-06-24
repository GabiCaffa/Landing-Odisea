import { useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  User as UserIcon,
  Camera,
  Lock,
  Mail,
  AlertTriangle,
  Upload,
  Trash2,
  Eye,
  EyeOff,
  ShieldCheck,
  Calendar,
  IdCard,
  Check,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PhoneInput from "@/components/PhoneInput";
import LocationSelect from "@/components/LocationSelect";
import { useAuth, formatEventDate } from "@/contexts/AuthContext";
import { normalizePhone, formatPhoneDisplay } from "@/lib/validators";
import { DEFAULT_COUNTRY_CODE, getCountry } from "@/lib/locations";
import { CountryCode } from "libphonenumber-js";
import { toast } from "sonner";

type Section = "info" | "avatar" | "security" | "danger";

const Profile = () => {
  const { currentUser, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [section, setSection] = useState<Section>("info");

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-xs tracking-[0.3em] uppercase text-muted-foreground">Cargando...</p>
      </div>
    );
  }
  if (!currentUser) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 pt-24 md:pt-32 pb-16">
        <div className="container-odisea max-w-5xl">
          {/* Header con info */}
          <div className="flex flex-col md:flex-row items-center gap-6 mb-10 p-6 md:p-8 rounded-2xl border border-border bg-card shadow-[var(--shadow-md)]">
            <div className="ring-4 ring-celeste ring-offset-2 ring-offset-card rounded-full">
              <ProfileAvatar size={96} />
            </div>
            <div className="text-center md:text-left flex-1">
              <p className="font-sport text-xs tracking-[0.4em] uppercase text-celeste-deep font-bold mb-1">
                Tu cuenta
              </p>
              <h1 className="title-sport text-3xl md:text-4xl lg:text-5xl tracking-wide font-black text-tinta leading-tight">
                {currentUser.firstName} {currentUser.lastName}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">{currentUser.email}</p>
              {currentUser.role === "admin" && (
                <span className="badge-celeste mt-3">
                  <ShieldCheck className="w-3 h-3" /> Admin
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 md:gap-10">
            {/* Tabs */}
            <nav className="flex md:flex-col gap-1 overflow-x-auto md:overflow-visible border-b md:border-b-0 md:border-r border-border md:pr-4">
              <TabLink
                icon={<UserIcon className="w-4 h-4" />}
                label="Mis datos"
                active={section === "info"}
                onClick={() => setSection("info")}
              />
              <TabLink
                icon={<Camera className="w-4 h-4" />}
                label="Foto de perfil"
                active={section === "avatar"}
                onClick={() => setSection("avatar")}
              />
              <TabLink
                icon={<Lock className="w-4 h-4" />}
                label="Seguridad"
                active={section === "security"}
                onClick={() => setSection("security")}
              />
              <TabLink
                icon={<AlertTriangle className="w-4 h-4" />}
                label="Eliminar cuenta"
                active={section === "danger"}
                onClick={() => setSection("danger")}
                danger
              />
            </nav>

            {/* Content */}
            <div className="min-h-[400px]">
              {section === "info" && <InfoSection />}
              {section === "avatar" && <AvatarSection />}
              {section === "security" && <SecuritySection />}
              {section === "danger" && <DangerSection onDeleted={() => navigate("/")} />}
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

const TabLink = ({
  icon,
  label,
  active,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
  danger?: boolean;
}) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-3 px-4 py-3 text-sm tracking-wide uppercase transition-colors whitespace-nowrap text-left ${
      active
        ? danger
          ? "bg-destructive text-destructive-foreground"
          : "bg-foreground text-background"
        : danger
        ? "text-destructive hover:bg-destructive/10"
        : "text-muted-foreground hover:text-foreground hover:bg-secondary"
    }`}
  >
    {icon}
    <span>{label}</span>
  </button>
);

// ─── AVATAR (componente reusable) ─────────────────────────────────────────
export const ProfileAvatar = ({ size = 40 }: { size?: number }) => {
  const { currentUser } = useAuth();
  if (!currentUser) return null;
  const initials = `${currentUser.firstName[0] ?? ""}${currentUser.lastName[0] ?? ""}`;
  return (
    <div
      style={{ width: size, height: size, fontSize: size * 0.35 }}
      className="rounded-full bg-foreground text-background overflow-hidden flex items-center justify-center font-semibold shrink-0"
    >
      {currentUser.avatarUrl ? (
        <img
          src={currentUser.avatarUrl}
          alt="Avatar"
          className="w-full h-full object-cover"
        />
      ) : (
        <span>{initials.toUpperCase()}</span>
      )}
    </div>
  );
};

// ─── INFO ─────────────────────────────────────────────────────────────────
const InfoSection = () => {
  const { currentUser, updateProfile } = useAuth();
  const [firstName, setFirstName] = useState(currentUser?.firstName ?? "");
  const [lastName, setLastName] = useState(currentUser?.lastName ?? "");
  const [birthDate, setBirthDate] = useState(currentUser?.birthDate ?? "");
  const [country, setCountry] = useState(currentUser?.country ?? DEFAULT_COUNTRY_CODE);
  const [state, setState] = useState(currentUser?.state ?? "");
  const [phone, setPhone] = useState(
    currentUser?.phone ? formatPhoneDisplay(currentUser.phone).replace(/^\+\d+\s*/, "") : ""
  );
  const [saving, setSaving] = useState(false);

  const dirty =
    firstName !== currentUser?.firstName ||
    lastName !== currentUser?.lastName ||
    birthDate !== currentUser?.birthDate ||
    country !== (currentUser?.country ?? DEFAULT_COUNTRY_CODE) ||
    state !== (currentUser?.state ?? "") ||
    !phoneMatchesCurrent(phone, country, currentUser?.phone);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim() || !birthDate) {
      toast.error("Completá todos los campos obligatorios");
      return;
    }
    if (!state.trim()) {
      toast.error("Indicá tu provincia o departamento");
      return;
    }
    const phoneE164 = normalizePhone(phone, country as CountryCode);
    if (!phoneE164) {
      toast.error("Número de teléfono inválido para ese país");
      return;
    }

    setSaving(true);
    const result = await updateProfile({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      birthDate,
      country,
      state: state.trim(),
      phone: phoneE164,
    });
    setSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo guardar");
      return;
    }
    toast.success("Datos actualizados");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <SectionHeader title="Mis datos" subtitle="Modificá tu información personal" />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Nombre">
          <input
            type="text"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="input-techno"
            required
          />
        </Field>
        <Field label="Apellido">
          <input
            type="text"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="input-techno"
            required
          />
        </Field>
      </div>

      <Field label="Fecha de nacimiento">
        <input
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
          className="input-techno"
          required
        />
      </Field>

      <LocationSelect
        country={country}
        state={state}
        onCountryChange={(c) => {
          setCountry(c);
          setState("");
        }}
        onStateChange={setState}
        required
      />

      <Field label="Teléfono">
        <PhoneInput
          country={country}
          value={phone}
          onCountryChange={(c) => {
            setCountry(c);
            setState("");
          }}
          onChange={setPhone}
          required
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <ReadOnlyField
          label="Documento"
          value={currentUser?.documentId ?? ""}
          icon={<IdCard className="w-4 h-4" />}
          hint="No se puede modificar"
        />
        <ReadOnlyField
          label="Miembro desde"
          value={formatEventDate(currentUser?.createdAt.slice(0, 10) ?? "")}
          icon={<Calendar className="w-4 h-4" />}
        />
      </div>

      <button
        type="submit"
        disabled={!dirty || saving}
        className="btn-techno disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? "Guardando..." : "Guardar cambios"}
      </button>
    </form>
  );
};

function phoneMatchesCurrent(typed: string, country: string, currentE164?: string): boolean {
  if (!currentE164 && !typed) return true;
  const normalized = normalizePhone(typed, country as CountryCode);
  return normalized === currentE164;
}

// ─── AVATAR ───────────────────────────────────────────────────────────────
const AvatarSection = () => {
  const { currentUser, uploadAvatar, removeAvatar } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Tiene que ser una imagen");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Máximo 5MB");
      return;
    }
    setUploading(true);
    const result = await uploadAvatar(file);
    setUploading(false);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo subir la imagen");
      return;
    }
    toast.success("Foto actualizada");
  };

  const handleRemove = async () => {
    if (!confirm("¿Quitar tu foto de perfil?")) return;
    const result = await removeAvatar();
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo quitar la foto");
      return;
    }
    toast.success("Foto quitada");
  };

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Foto de perfil"
        subtitle="Subí una imagen cuadrada para que se vea bien"
      />

      <div className="flex flex-col sm:flex-row items-center gap-6 p-6 border border-border bg-card">
        <div className="w-32 h-32 rounded-full bg-foreground text-background overflow-hidden flex items-center justify-center font-display text-4xl shrink-0 border-4 border-background shadow-lg">
          {currentUser?.avatarUrl ? (
            <img src={currentUser.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
          ) : (
            <span>
              {currentUser?.firstName[0]?.toUpperCase()}
              {currentUser?.lastName[0]?.toUpperCase()}
            </span>
          )}
        </div>

        <div className="flex-1 text-center sm:text-left space-y-3">
          <p className="text-sm text-muted-foreground">
            JPG o PNG. Se recomienda una imagen de al menos 400×400px.
          </p>
          <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="btn-techno text-xs py-2 px-4"
            >
              <Upload className="w-4 h-4" />
              {uploading ? "Subiendo..." : currentUser?.avatarUrl ? "Cambiar" : "Subir foto"}
            </button>
            {currentUser?.avatarUrl && (
              <button
                type="button"
                onClick={handleRemove}
                disabled={uploading}
                className="inline-flex items-center gap-2 text-xs tracking-wider uppercase border border-border px-4 py-2 hover:bg-destructive hover:text-destructive-foreground hover:border-destructive transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Quitar
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};

// ─── SEGURIDAD ────────────────────────────────────────────────────────────
const SecuritySection = () => {
  const { currentUser, changePassword, changeEmail } = useAuth();
  const [pwOpen, setPwOpen] = useState(true);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      toast.error("Mínimo 6 caracteres");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Las contraseñas no coinciden");
      return;
    }
    setPwSaving(true);
    const result = await changePassword(currentPassword, newPassword);
    setPwSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo cambiar la contraseña");
      return;
    }
    toast.success("Contraseña actualizada");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      toast.error("Email inválido");
      return;
    }
    if (newEmail.toLowerCase() === currentUser?.email.toLowerCase()) {
      toast.error("Es tu email actual");
      return;
    }
    setEmailSaving(true);
    const result = await changeEmail(newEmail);
    setEmailSaving(false);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo cambiar el email");
      return;
    }
    setEmailSent(true);
    toast.success("Te enviamos un email de confirmación");
  };

  return (
    <div className="space-y-8">
      <SectionHeader title="Seguridad" subtitle="Cambiá tu contraseña o email" />

      {/* Cambio de contraseña */}
      <div className="border border-border bg-card">
        <button
          onClick={() => setPwOpen((o) => !o)}
          className="w-full flex items-center justify-between p-5 hover:bg-secondary/30 transition-colors"
        >
          <div className="flex items-center gap-3">
            <Lock className="w-4 h-4" />
            <span className="text-sm tracking-wide uppercase font-semibold">
              Cambiar contraseña
            </span>
          </div>
          <span className="text-muted-foreground">{pwOpen ? "−" : "+"}</span>
        </button>
        {pwOpen && (
          <form onSubmit={handlePassword} className="p-5 pt-0 space-y-4 border-t border-border">
            <Field label="Contraseña actual">
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  className="input-techno pr-10"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Mostrar/ocultar"
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </Field>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Nueva contraseña">
                <input
                  type={showPw ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="input-techno"
                  autoComplete="new-password"
                  placeholder="Mínimo 6 caracteres"
                />
              </Field>
              <Field label="Confirmar nueva">
                <input
                  type={showPw ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="input-techno"
                  autoComplete="new-password"
                />
              </Field>
            </div>
            <button
              type="submit"
              disabled={pwSaving}
              className="btn-techno disabled:opacity-60"
            >
              {pwSaving ? "Guardando..." : "Actualizar contraseña"}
            </button>
          </form>
        )}
      </div>

      {/* Cambio de email */}
      <div className="border border-border bg-card p-5 space-y-4">
        <div className="flex items-center gap-3">
          <Mail className="w-4 h-4" />
          <span className="text-sm tracking-wide uppercase font-semibold">Cambiar email</span>
        </div>
        <p className="text-xs text-muted-foreground">
          Email actual: <span className="font-mono">{currentUser?.email}</span>
        </p>

        {emailSent ? (
          <div className="flex items-start gap-3 p-4 border border-foreground/30 bg-foreground/5">
            <Check className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Email de confirmación enviado</p>
              <p className="text-xs text-muted-foreground mt-1">
                Revisá tu casilla en <span className="font-mono">{newEmail}</span> y hacé click en
                el link para confirmar el cambio. El email viejo seguirá activo hasta entonces.
              </p>
            </div>
          </div>
        ) : (
          <form onSubmit={handleEmail} className="space-y-4">
            <Field label="Nuevo email">
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                required
                className="input-techno"
                placeholder="nuevo@email.com"
                autoComplete="email"
              />
            </Field>
            <button
              type="submit"
              disabled={emailSaving}
              className="btn-techno disabled:opacity-60"
            >
              {emailSaving ? "Enviando..." : "Enviar confirmación"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

// ─── ZONA PELIGROSA ───────────────────────────────────────────────────────
const DangerSection = ({ onDeleted }: { onDeleted: () => void }) => {
  const { deleteMyAccount } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const result = await deleteMyAccount(password);
    setSubmitting(false);
    if (!result.ok) {
      toast.error(result.error ?? "No se pudo eliminar la cuenta");
      return;
    }
    toast.success("Cuenta eliminada");
    onDeleted();
  };

  return (
    <div className="space-y-6">
      <SectionHeader title="Eliminar cuenta" subtitle="Esta acción no se puede deshacer" />

      <div className="border-2 border-destructive/30 bg-destructive/5 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-destructive">
              Vas a eliminar tu cuenta permanentemente
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Se eliminarán tus datos personales, tu foto de perfil y tu historial. No es posible
              recuperar la cuenta una vez eliminada.
            </p>
          </div>
        </div>

        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-2 text-xs tracking-wider uppercase border border-destructive text-destructive px-4 py-3 hover:bg-destructive hover:text-destructive-foreground transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            Quiero eliminar mi cuenta
          </button>
        ) : (
          <form onSubmit={handleDelete} className="space-y-4">
            <Field label="Confirmá con tu contraseña">
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="input-techno"
                autoComplete="current-password"
              />
            </Field>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setPassword("");
                }}
                className="btn-techno-outline text-xs py-2 px-4"
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-2 text-xs tracking-wider uppercase bg-destructive text-destructive-foreground px-4 py-3 hover:bg-destructive/90 transition-colors disabled:opacity-60"
              >
                <Trash2 className="w-4 h-4" />
                {submitting ? "Eliminando..." : "Eliminar mi cuenta para siempre"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

// ─── Helpers UI ───────────────────────────────────────────────────────────
const SectionHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="border-l-4 border-celeste pl-4 mb-2">
    <h2 className="title-sport text-3xl md:text-4xl tracking-wide font-black text-tinta">{title.toUpperCase()}</h2>
    <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
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

const ReadOnlyField = ({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  hint?: string;
}) => (
  <div>
    <span className="block text-xs tracking-[0.2em] uppercase text-muted-foreground mb-2">
      {label}
    </span>
    <div className="flex items-center gap-2 px-4 py-3 border border-border bg-muted/30 text-sm font-mono">
      {icon}
      <span>{value}</span>
    </div>
    {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
  </div>
);

export default Profile;
